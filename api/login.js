const { users, isAdmin, safeEqual, createCookie, json } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'POST' });
  try {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Permintaan tidak diizinkan.' });
    const { username = '', password = '', remember = false } = req.body || {};
    const user = users().find((candidate) => safeEqual(username, candidate.id) && safeEqual(password, candidate.password));
    if (!user) return json(res, 401, { error: 'ID pengguna atau kata sandi tidak sesuai.' });
    return json(res, 200, { authenticated: true, role: isAdmin(user.id) ? 'admin' : 'user' }, { 'Set-Cookie': createCookie(user.id, req, remember === true) });
  } catch (error) {
    console.error('Login API configuration error:', error.message);
    return json(res, 500, { error: 'Autentikasi belum dikonfigurasi dengan benar.' });
  }
};
