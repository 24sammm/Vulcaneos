const { getSession, isAdmin, json } = require('../lib/auth');
const {
  isConfigured,
  findUser,
  listThreads,
  getThread,
  createThread,
  createReply,
  createGuestReply,
  toggleThreadLike,
  deleteThread,
  deleteGuestThread,
  deleteReply,
  DatabaseError,
} = require('../lib/db');

function text(value, min, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length < min || trimmed.length > max ? null : trimmed;
}

function objectIdText(value) {
  const text = String(value ?? '');
  return /^[a-f0-9]{24}$/i.test(text) ? text : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'GET, POST' });
  }

  try {
    if (!isConfigured()) {
      return json(res, 503, { error: 'Forum belum aktif. Admin perlu mengatur MONGODB_URI di environment Vercel.' });
    }

    const session = getSession(req);
    const visitorToken = req.headers['x-forum-visitor'];

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const threadId = url.searchParams.get('threadId');
      if (threadId) {
        const id = objectIdText(threadId);
        if (!id) return json(res, 400, { error: 'ID diskusi tidak valid.' });
        const thread = await getThread(id, { username: session?.sub, visitorToken });
        if (!thread) return json(res, 404, { error: 'Diskusi tidak ditemukan.' });
        return json(res, 200, { thread });
      }
      const threads = await listThreads(50);
      return json(res, 200, { threads });
    }

    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Permintaan tidak diizinkan.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = body.action;

    if (action === 'create-thread') {
      if (!session) return json(res, 401, { error: 'Masuk terlebih dahulu untuk membuat topik.' });
      const title = text(body.title, 5, 140);
      const content = text(body.body, 5, 5000);
      if (!title) return json(res, 400, { error: 'Judul diskusi harus 5–140 karakter.' });
      if (!content) return json(res, 400, { error: 'Isi diskusi harus 5–5000 karakter.' });
      const id = await createThread(session.sub, title, content);
      return json(res, 201, { id });
    }

    if (action === 'delete-thread') {
      const threadId = objectIdText(body.threadId);
      if (!threadId) return json(res, 400, { error: 'ID diskusi tidak valid.' });
      if (session && isAdmin(session.sub)) {
        await deleteThread(threadId, session.sub, true);
      } else if (typeof body.deleteToken === 'string') {
        await deleteGuestThread(threadId, body.deleteToken);
      } else if (session) {
        await deleteThread(threadId, session.sub, false);
      } else {
        return json(res, 401, { error: 'Token penghapusan diskusi diperlukan.' });
      }
      return json(res, 200, { deleted: true });
    }

    if (action === 'toggle-like') {
      if (!session) return json(res, 401, { error: 'Masuk terlebih dahulu untuk menyukai diskusi.' });
      if (!await findUser(session.sub)) return json(res, 401, { error: 'Akun tidak ditemukan. Silakan masuk kembali.' });
      const threadId = objectIdText(body.threadId);
      if (!threadId) return json(res, 400, { error: 'ID diskusi tidak valid.' });
      const result = await toggleThreadLike(threadId, { username: session.sub });
      return json(res, 200, result);
    }

    if (action === 'create-reply') {
      const threadId = objectIdText(body.threadId);
      const content = text(body.body, 2, 3000);
      if (!threadId) return json(res, 400, { error: 'ID diskusi tidak valid.' });
      if (!content) return json(res, 400, { error: 'Balasan harus 2–3000 karakter.' });
      const id = session
        ? await createReply(session.sub, threadId, content)
        : await createGuestReply(threadId, content);
      return json(res, 201, { id });
    }

    if (action === 'delete-reply') {
      if (!session) return json(res, 401, { error: 'Masuk terlebih dahulu untuk menghapus komentar.' });
      const replyId = objectIdText(body.replyId);
      if (!replyId) return json(res, 400, { error: 'ID balasan tidak valid.' });
      await deleteReply(replyId, session.sub, isAdmin(session.sub));
      return json(res, 200, { deleted: true });
    }

    if (!session) return json(res, 401, { error: 'Masuk terlebih dahulu untuk mengelola diskusi.' });

    return json(res, 400, { error: 'Aksi forum tidak dikenali.' });
  } catch (error) {
    if (error instanceof DatabaseError) return json(res, error.status, { error: error.message });
    console.error('Forum API error:', error.message);
    return json(res, 500, { error: 'Forum sedang tidak dapat diproses.' });
  }
};
