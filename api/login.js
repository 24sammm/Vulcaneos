const { users, isAdmin, safeEqual, createCookie, json } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'POST' });
  try {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Permintaan tidak diizinkan.' });
    const { username = '', password = '', remember = false } = req.body || {};
    const user = users().find((candidate) => safeEqual(username, candidate.id) && safeEqual(password, candidate.password));
    if (!user) return json(res, 401, { error: 'ID pengguna atau kata sandi tidak sesuai.' });
    const role = isAdmin(user.id) ? 'admin' : 'user';
    const cookie = createCookie(user.id, req, remember === true);
    if (req.headers.accept?.includes('text/html')) {
      res.statusCode = 303;
      res.setHeader('Location', role === 'admin' ? '/webgis.html' : '/peta.html');
      res.setHeader('Set-Cookie', cookie);
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    return json(res, 200, { authenticated: true, role }, { 'Set-Cookie': cookie });
  } catch (error) {
    console.error('Login API configuration error:', error.message);
    return json(res, 500, { error: 'Autentikasi belum dikonfigurasi dengan benar.' });
  }
};
