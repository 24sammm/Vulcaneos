const crypto = require('node:crypto');
const { users, profileFor, isAdmin } = require('./auth');

const DEFAULT_DB = 'vulcaneos';
const COLLECTIONS = { users: 'users', threads: 'forum_threads' };

let clientPromise = null;
let setupPromise = null;
let driver = null;

class DatabaseError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'DatabaseError';
    this.status = status;
  }
}

function connectionString() {
  return String(process.env.MONGODB_URI || process.env.MONGODB_URL || '').trim();
}

function isConfigured() {
  return Boolean(connectionString());
}

function mongo() {
  if (!driver) {
    try {
      driver = require('mongodb');
    } catch {
      throw new DatabaseError('Driver MongoDB belum terpasang. Jalankan npm install.', 500);
    }
  }
  return driver;
}

function databaseName() {
  if (process.env.MONGODB_DB) return String(process.env.MONGODB_DB).trim();
  const withoutQuery = connectionString().split('?')[0];
  const schemeEnd = withoutQuery.indexOf('://');
  const pathStart = schemeEnd === -1 ? -1 : withoutQuery.indexOf('/', schemeEnd + 3);
  const name = pathStart === -1 ? '' : withoutQuery.slice(pathStart + 1);
  return name || DEFAULT_DB;
}

function getClient() {
  const value = connectionString();
  if (!value) throw new DatabaseError('Database belum dikonfigurasi. Admin perlu mengatur MONGODB_URI.', 503);
  if (!clientPromise) {
    const { MongoClient } = mongo();
    clientPromise = MongoClient.connect(value, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    }).catch((error) => {
      clientPromise = null;
      console.error('MongoDB connection failed:', error.message);
      throw new DatabaseError('Database sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.', 503);
    });
  }
  return clientPromise;
}

async function collections() {
  const client = await getClient();
  const database = client.db(databaseName());
  return {
    database,
    users: database.collection(COLLECTIONS.users),
    threads: database.collection(COLLECTIONS.threads),
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function objectId(value) {
  const text = String(value ?? '');
  if (!/^[a-f0-9]{24}$/i.test(text)) return null;
  const { ObjectId } = mongo();
  return new ObjectId(text);
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

async function seedEnvUsers(userCollection) {
  for (const user of users()) {
    const profile = profileFor(user.id);
    const role = isAdmin(user.id) ? 'admin' : 'user';
    const existing = await userCollection.findOne({ username: user.id });
    if (!existing) {
      await userCollection.insertOne({
        username: user.id,
        passwordHash: hashPassword(user.password),
        name: profile.name,
        institution: profile.institution,
        bio: '',
        role,
        createdAt: new Date(),
      });
      continue;
    }
    if (!verifyPassword(user.password, existing.passwordHash)) {
      await userCollection.updateOne({ _id: existing._id }, { $set: { passwordHash: hashPassword(user.password), role } });
    } else if (role === 'admin' && existing.role !== 'admin') {
      await userCollection.updateOne({ _id: existing._id }, { $set: { role: 'admin' } });
    }
  }
}

async function ensureSchema() {
  if (!isConfigured()) throw new DatabaseError('Database belum dikonfigurasi. Admin perlu mengatur MONGODB_URI.', 503);
  if (!setupPromise) {
    setupPromise = (async () => {
      const { users: userCollection, threads } = await collections();
      await userCollection.createIndex({ username: 1 }, { unique: true });
      await userCollection.createIndex(
        { emailNormalized: 1 },
        { unique: true, partialFilterExpression: { emailNormalized: { $type: 'string' } } }
      );
      await threads.createIndex({ lastActivityAt: -1 });
      await seedEnvUsers(userCollection);
    })().catch((error) => {
      setupPromise = null;
      if (error instanceof DatabaseError) throw error;
      console.error('MongoDB setup failed:', error.message);
      throw new DatabaseError('Database belum siap. Periksa koneksi MONGODB_URI.', 503);
    });
  }
  return setupPromise;
}

function authorOf(doc) {
  if (!doc) return { username: '', name: 'Pengguna', institution: '', role: 'user' };
  return {
    username: doc.username,
    name: doc.name,
    institution: doc.institution || '',
    role: doc.role === 'admin' ? 'admin' : 'user',
  };
}

function guestAuthor() {
  return { username: null, name: 'Pengunjung', institution: '', role: 'guest' };
}

function likeKey(viewer) {
  const identity = viewer?.username
    ? `account:${viewer.username}`
    : typeof viewer?.visitorToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(viewer.visitorToken)
      ? `guest:${viewer.visitorToken}`
      : '';
  return identity ? crypto.createHash('sha256').update(identity).digest('hex') : null;
}

function publicUser(doc) {
  if (!doc) return null;
  return {
    username: doc.username,
    name: doc.name,
    institution: doc.institution || '',
    bio: doc.bio || '',
    role: doc.role === 'admin' ? 'admin' : 'user',
    joinedAt: toIso(doc.createdAt),
  };
}

async function findUser(username) {
  await ensureSchema();
  const { users: userCollection } = await collections();
  return userCollection.findOne({ username });
}

async function getProfile(username) {
  await ensureSchema();
  const { users: userCollection, threads } = await collections();
  const user = await userCollection.findOne({ username });
  if (!user) return null;
  const threadCount = await threads.countDocuments({ userId: user._id });
  const replyCountResult = await threads.aggregate([
    { $unwind: '$replies' },
    { $match: { 'replies.userId': user._id } },
    { $count: 'total' },
  ]).toArray();
  return {
    ...publicUser(user),
    threadCount,
    replyCount: replyCountResult[0]?.total || 0,
  };
}

async function verifyLogin(username, password) {
  const user = await findUser(username);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}

async function registerUser({ username, email, name, institution, password }) {
  await ensureSchema();
  const { users: userCollection } = await collections();
  const normalizedEmail = email.trim().toLowerCase();
  try {
    await userCollection.insertOne({
      username,
      email: email.trim(),
      emailNormalized: normalizedEmail,
      passwordHash: hashPassword(password),
      name: name.trim(),
      institution: institution.trim(),
      bio: '',
      role: 'user',
      createdAt: new Date(),
    });
  } catch (error) {
    if (error?.code === 11000) throw new DatabaseError('ID pengguna atau email sudah terdaftar.', 409);
    throw error;
  }
  return { username, name: name.trim(), institution: institution.trim(), role: 'user' };
}

async function updateProfile(username, { name, institution, bio }) {
  await ensureSchema();
  const { users: userCollection } = await collections();
  const user = await userCollection.findOneAndUpdate(
    { username },
    { $set: { name, institution, bio } },
    { returnDocument: 'after' }
  );
  return publicUser(user);
}

async function listRegisteredUsers(limit = 500) {
  await ensureSchema();
  const { users: userCollection } = await collections();
  const rows = await userCollection.find(
    { emailNormalized: { $type: 'string' }, role: 'user' },
    { projection: { username: 1, email: 1, name: 1, institution: 1, bio: 1, createdAt: 1 } }
  ).sort({ createdAt: -1, username: 1 }).limit(limit).toArray();
  return rows.map((user) => ({
    username: user.username,
    email: user.email || '',
    name: user.name || user.username,
    institution: user.institution || '',
    bio: user.bio || '',
    joinedAt: toIso(user.createdAt),
  }));
}

async function deleteRegisteredUser(username) {
  await ensureSchema();
  const { users: userCollection, threads } = await collections();
  const user = await userCollection.findOne(
    { username, emailNormalized: { $type: 'string' }, role: 'user' },
    { projection: { _id: 1 } }
  );
  if (!user) throw new DatabaseError('Akun registrasi tidak ditemukan atau tidak dapat dihapus.', 404);

  await threads.updateMany(
    { 'replies.userId': user._id },
    [{
      $set: {
        replies: {
          $map: {
            input: { $ifNull: ['$replies', []] },
            as: 'reply',
            in: {
              $cond: [
                { $eq: ['$$reply.userId', user._id] },
                { $mergeObjects: ['$$reply', { userId: null, authorType: 'guest' }] },
                '$$reply',
              ],
            },
          },
        },
      },
    }]
  );
  await threads.updateMany(
    { userId: user._id },
    { $set: { userId: null, authorType: 'guest' } }
  );
  const accountLikeKey = crypto.createHash('sha256').update(`account:${username}`).digest('hex');
  await threads.updateMany({ likes: accountLikeKey }, { $pull: { likes: accountLikeKey } });

  const result = await userCollection.deleteOne({
    _id: user._id,
    emailNormalized: { $type: 'string' },
    role: 'user',
  });
  if (!result.deletedCount) throw new DatabaseError('Akun gagal dihapus. Muat ulang daftar dan coba lagi.', 409);
}

async function listThreads(limit = 50) {
  await ensureSchema();
  const { threads } = await collections();
  const rows = await threads.aggregate([
    { $sort: { lastActivityAt: -1 } },
    { $limit: limit },
    { $lookup: { from: COLLECTIONS.users, localField: 'userId', foreignField: '_id', as: 'authorDoc' } },
    { $unwind: { path: '$authorDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        title: 1,
        body: 1,
        createdAt: 1,
        lastActivityAt: 1,
        replyCount: { $size: { $ifNull: ['$replies', []] } },
        likeCount: { $size: { $ifNull: ['$likes', []] } },
        authorDoc: 1,
        authorType: 1,
      },
    },
  ]).toArray();
  return rows.map((row) => ({
    id: row._id.toString(),
    title: row.title,
    excerpt: String(row.body || '').slice(0, 260),
    createdAt: toIso(row.createdAt),
    lastActivity: toIso(row.lastActivityAt || row.createdAt),
    replyCount: row.replyCount,
    likeCount: row.likeCount,
    author: row.authorType === 'guest' ? guestAuthor() : authorOf(row.authorDoc),
  }));
}

async function getThread(id, viewer = null) {
  await ensureSchema();
  const threadId = objectId(id);
  if (!threadId) return null;
  const { users: userCollection, threads } = await collections();
  const thread = await threads.findOne({ _id: threadId });
  if (!thread) return null;

  const replies = Array.isArray(thread.replies) ? thread.replies : [];
  const authorIds = [thread.userId, ...replies.map((reply) => reply.userId)].filter(Boolean);
  const authorDocs = authorIds.length
    ? await userCollection.find({ _id: { $in: authorIds } }).toArray()
    : [];
  const authorById = new Map(authorDocs.map((doc) => [doc._id.toString(), doc]));
  const viewerKey = likeKey(viewer);
  const likes = Array.isArray(thread.likes) ? thread.likes : [];

  return {
    id: thread._id.toString(),
    title: thread.title,
    body: thread.body,
    createdAt: toIso(thread.createdAt),
    author: thread.authorType === 'guest' ? guestAuthor() : authorOf(authorById.get(String(thread.userId))),
    replies: replies.map((reply) => ({
      id: reply._id.toString(),
      body: reply.body,
      createdAt: toIso(reply.createdAt),
      author: reply.authorType === 'guest' ? guestAuthor() : authorOf(authorById.get(String(reply.userId))),
    })),
    likeCount: likes.length,
    likedByMe: Boolean(viewerKey && likes.includes(viewerKey)),
  };
}

async function createThread(username, title, body) {
  const user = await findUser(username);
  if (!user) throw new DatabaseError('Akun tidak ditemukan di database. Masuk ulang untuk menyegarkan sesi.', 401);
  const { threads } = await collections();
  const now = new Date();
  const result = await threads.insertOne({
    userId: user._id,
    title,
    body,
    replies: [],
    createdAt: now,
    lastActivityAt: now,
  });
  return result.insertedId.toString();
}

async function createGuestThread(title, body) {
  await ensureSchema();
  const { threads } = await collections();
  const deleteToken = crypto.randomBytes(32).toString('base64url');
  const guestDeleteTokenHash = crypto.createHash('sha256').update(deleteToken).digest('hex');
  const now = new Date();
  const result = await threads.insertOne({
    userId: null,
    authorType: 'guest',
    guestDeleteTokenHash,
    title,
    body,
    replies: [],
    createdAt: now,
    lastActivityAt: now,
  });
  return { id: result.insertedId.toString(), deleteToken };
}

async function deleteGuestThread(threadId, deleteToken) {
  await ensureSchema();
  const id = objectId(threadId);
  if (!id || typeof deleteToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(deleteToken)) {
    throw new DatabaseError('Diskusi tidak ditemukan atau token penghapusan tidak valid.', 403);
  }
  const { threads } = await collections();
  const thread = await threads.findOne({ _id: id, authorType: 'guest' });
  const suppliedHash = crypto.createHash('sha256').update(deleteToken).digest();
  const storedHash = Buffer.from(thread?.guestDeleteTokenHash || '', 'hex');
  if (!thread || storedHash.length !== suppliedHash.length || !crypto.timingSafeEqual(storedHash, suppliedHash)) {
    throw new DatabaseError('Diskusi tidak ditemukan atau token penghapusan tidak valid.', 403);
  }
  await threads.deleteOne({ _id: id });
}

async function createReply(username, threadId, body) {
  const { ObjectId } = mongo();
  const user = await findUser(username);
  if (!user) throw new DatabaseError('Akun tidak ditemukan di database. Masuk ulang untuk menyegarkan sesi.', 401);
  const id = objectId(threadId);
  if (!id) throw new DatabaseError('Diskusi tidak ditemukan.', 404);
  const { threads } = await collections();
  const thread = await threads.findOne({ _id: id });
  if (!thread) throw new DatabaseError('Diskusi tidak ditemukan.', 404);

  const reply = { _id: new ObjectId(), userId: user._id, body, createdAt: new Date() };
  await threads.updateOne(
    { _id: id },
    { $push: { replies: reply }, $set: { lastActivityAt: reply.createdAt } }
  );
  return reply._id.toString();
}

async function createGuestReply(threadId, body) {
  await ensureSchema();
  const id = objectId(threadId);
  if (!id) throw new DatabaseError('Diskusi tidak ditemukan.', 404);
  const { threads } = await collections();
  const now = new Date();
  const { ObjectId } = mongo();
  const reply = { _id: new ObjectId(), userId: null, authorType: 'guest', body, createdAt: now };
  const result = await threads.updateOne(
    { _id: id },
    { $push: { replies: reply }, $set: { lastActivityAt: now } }
  );
  if (!result.matchedCount) throw new DatabaseError('Diskusi tidak ditemukan.', 404);
  return reply._id.toString();
}

async function toggleThreadLike(threadId, viewer) {
  await ensureSchema();
  const id = objectId(threadId);
  const key = likeKey(viewer);
  if (!id) throw new DatabaseError('Diskusi tidak ditemukan.', 404);
  if (!key) throw new DatabaseError('Identitas pengunjung tidak valid. Muat ulang halaman lalu coba lagi.', 400);
  const { threads } = await collections();
  const result = await threads.updateOne({ _id: id }, [
    {
      $set: {
        likes: {
          $let: {
            vars: { current: { $ifNull: ['$likes', []] } },
            in: {
              $cond: [
                { $in: [key, '$$current'] },
                { $filter: { input: '$$current', as: 'like', cond: { $ne: ['$$like', key] } } },
                { $concatArrays: ['$$current', [key]] },
              ],
            },
          },
        },
      },
    },
  ]);
  if (!result.matchedCount) throw new DatabaseError('Diskusi tidak ditemukan.', 404);
  const thread = await threads.findOne({ _id: id }, { projection: { likes: 1 } });
  const likes = Array.isArray(thread?.likes) ? thread.likes : [];
  return { liked: likes.includes(key), likeCount: likes.length };
}

async function deleteThread(threadId, username, admin = false) {
  await ensureSchema();
  const id = objectId(threadId);
  if (!id) throw new DatabaseError('Diskusi tidak ditemukan atau Anda tidak berhak menghapusnya.', 403);
  const { users: userCollection, threads } = await collections();
  const thread = await threads.findOne({ _id: id });
  if (!thread) throw new DatabaseError('Diskusi tidak ditemukan atau Anda tidak berhak menghapusnya.', 403);

  if (!admin) {
    const user = await userCollection.findOne({ username });
    if (!user || String(thread.userId) !== String(user._id)) {
      throw new DatabaseError('Diskusi tidak ditemukan atau Anda tidak berhak menghapusnya.', 403);
    }
  }
  await threads.deleteOne({ _id: id });
}

async function deleteReply(replyId, username, admin = false) {
  await ensureSchema();
  const replyOid = objectId(replyId);
  if (!replyOid) throw new DatabaseError('Balasan tidak ditemukan atau Anda tidak berhak menghapusnya.', 403);
  const { users: userCollection, threads } = await collections();
  const thread = await threads.findOne({ 'replies._id': replyOid });
  if (!thread) throw new DatabaseError('Balasan tidak ditemukan atau Anda tidak berhak menghapusnya.', 403);

  if (!admin) {
    const reply = (thread.replies || []).find((item) => String(item._id) === String(replyOid));
    const user = await userCollection.findOne({ username });
    if (!reply || !user || String(reply.userId) !== String(user._id)) {
      throw new DatabaseError('Balasan tidak ditemukan atau Anda tidak berhak menghapusnya.', 403);
    }
  }

  await threads.updateOne({ _id: thread._id }, [
    {
      $set: {
        replies: {
          $filter: {
            input: { $ifNull: ['$replies', []] },
            as: 'reply',
            cond: { $ne: ['$$reply._id', replyOid] },
          },
        },
      },
    },
    {
      $set: {
        lastActivityAt: { $ifNull: [{ $max: '$replies.createdAt' }, '$createdAt'] },
      },
    },
  ]);
}

module.exports = {
  DatabaseError,
  isConfigured,
  ensureSchema,
  findUser,
  getProfile,
  verifyLogin,
  registerUser,
  updateProfile,
  listRegisteredUsers,
  deleteRegisteredUser,
  listThreads,
  getThread,
  createThread,
  createReply,
  createGuestReply,
  toggleThreadLike,
  deleteThread,
  createGuestThread,
  deleteGuestThread,
  deleteReply,
};
