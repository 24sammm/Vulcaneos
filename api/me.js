const { getSession, profileFor, isAdmin, clearCookie, json } = require('../lib/auth');
const {
  DatabaseError,
  findUser,
  getProfile,
  isConfigured,
  listUserNotifications,
  openUserNotifications,
} = require('../lib/db');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const resource = req.query?.resource || url.searchParams.get('resource');
  if (resource === 'notifications') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'GET, POST' });
    }
    try {
      const session = getSession(req);
      if (!session) return json(res, 401, { error: 'Masuk terlebih dahulu untuk melihat notifikasi.' });
      if (!isConfigured()) return json(res, 503, { error: 'Notifikasi belum aktif karena database belum dikonfigurasi.' });
      const user = await findUser(session.sub);
      if (!user) {
        return json(
          res,
          401,
          { error: 'Akun tidak ditemukan. Silakan masuk kembali.' },
          { 'Set-Cookie': clearCookie(req) }
        );
      }
      if (user.role !== 'user' || typeof user.emailNormalized !== 'string') {
        return json(res, 403, { error: 'Notifikasi hanya tersedia untuk akun pengguna.' });
      }

      if (req.method === 'GET') {
        return json(res, 200, await listUserNotifications(session.sub));
      }

      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) {
        return json(res, 403, { error: 'Permintaan tidak diizinkan.' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (body.action !== 'open') return json(res, 400, { error: 'Aksi notifikasi tidak dikenali.' });
      return json(res, 200, await openUserNotifications(session.sub));
    } catch (error) {
      if (error instanceof DatabaseError) return json(res, error.status, { error: error.message });
      console.error('User notifications API error:', error.message);
      return json(res, 500, { error: 'Notifikasi tidak dapat dimuat.' });
    }
  }

  if (req.method !== 'GET') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'GET' });
  try {
    const session = getSession(req);
    if (!session) {
      return json(res, 200, { authenticated: false, user: null, profile: null, role: null });
    }
    if (isConfigured()) {
      const profile = await getProfile(session.sub);
      if (!profile) {
        return json(
          res,
          200,
          { authenticated: false, user: null, profile: null, role: null },
          { 'Set-Cookie': clearCookie(req) }
        );
      }
      return json(res, 200, {
        authenticated: true,
        user: session.sub,
        profile,
        role: profile.role,
      });
    }
    return json(res, 200, {
      authenticated: true,
      user: session.sub,
      profile: profileFor(session.sub),
      role: isAdmin(session.sub) ? 'admin' : 'user',
    });
  } catch (error) {
    if (error instanceof DatabaseError) {
      console.error('Session database error:', error.message);
      return json(res, error.status, { error: error.message });
    }
    console.error('Session API configuration error:', error.message);
    return json(res, 500, { error: 'Autentikasi belum dikonfigurasi dengan benar.' });
  }
};
