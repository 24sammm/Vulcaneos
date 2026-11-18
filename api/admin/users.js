const { getSession, isAdmin, json } = require('../../lib/auth');
const {
  DatabaseError,
  createAdminNotification,
  deleteRegisteredUser,
  isConfigured,
  listRegisteredUsers,
} = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'POST') {
    return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'GET, POST, DELETE' });
  }

  try {
    const session = getSession(req);
    if (!session) return json(res, 401, { error: 'Masuk sebagai admin untuk mengelola akun.' });
    if (!isAdmin(session.sub)) return json(res, 403, { error: 'Hanya admin yang dapat mengelola akun.' });
    if (!isConfigured()) {
      return json(res, 503, { error: 'Database belum dikonfigurasi. Admin perlu mengatur MONGODB_URI.' });
    }

    if (req.method === 'GET') {
      const users = await listRegisteredUsers();
      return json(res, 200, { users });
    }

    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      return json(res, 403, { error: 'Permintaan tidak diizinkan.' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (req.method === 'POST') {
      if (body.action !== 'send-notification') {
        return json(res, 400, { error: 'Aksi notifikasi tidak dikenali.' });
      }
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (title.length < 3 || title.length > 120) {
        return json(res, 400, { error: 'Judul informasi harus 3–120 karakter.' });
      }
      if (message.length < 3 || message.length > 3000) {
        return json(res, 400, { error: 'Isi informasi harus 3–3000 karakter.' });
      }

      let recipientUsernames = null;
      if (body.recipientMode === 'selected') {
        if (!Array.isArray(body.usernames) || body.usernames.length < 1 || body.usernames.length > 500) {
          return json(res, 400, { error: 'Pilih setidaknya satu user sebagai penerima.' });
        }
        if (body.usernames.some((username) => typeof username !== 'string' || !/^[A-Za-z0-9._-]{3,32}$/.test(username))) {
          return json(res, 400, { error: 'Daftar penerima tidak valid.' });
        }
        recipientUsernames = [...new Set(body.usernames)];
      } else if (body.recipientMode !== 'all') {
        return json(res, 400, { error: 'Pilihan penerima tidak valid.' });
      }

      const sentCount = await createAdminNotification({
        title,
        message,
        recipientUsernames,
        createdBy: session.sub,
      });
      return json(res, 201, { sentCount });
    }

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
      return json(res, 400, { error: 'ID pengguna tidak valid.' });
    }
    if (username === session.sub) {
      return json(res, 400, { error: 'Admin tidak dapat menghapus akunnya sendiri dari halaman ini.' });
    }
    if (isAdmin(username)) {
      return json(res, 403, { error: 'Akun admin tidak dapat dihapus dari halaman ini.' });
    }

    await deleteRegisteredUser(username);
    return json(res, 200, { deleted: true, username });
  } catch (error) {
    if (error instanceof DatabaseError) return json(res, error.status, { error: error.message });
    console.error('Admin user management API error:', error.message);
    return json(res, 500, { error: 'Permintaan admin tidak dapat diproses.' });
  }
};
