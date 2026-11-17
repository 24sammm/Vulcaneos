const { users, isAdmin, safeEqual, createCookie, json } = require('../lib/auth');
const { isConfigured, verifyLogin, DatabaseError } = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'POST' });
  try {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Permintaan tidak diizinkan.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const remember = body.remember === true;

    let role = null;
    if (isConfigured()) {
      const user = await verifyLogin(username, password);
      if (!user) return json(res, 401, { error: 'ID pengguna atau kata sandi tidak sesuai.' });
      role = user.role;
    } else {
      const user = users().find((candidate) => safeEqual(username, candidate.id) && safeEqual(password, candidate.password));
      if (!user) return json(res, 401, { error: 'ID pengguna atau kata sandi tidak sesuai.' });
      role = isAdmin(user.id) ? 'admin' : 'user';
    }

    const cookie = createCookie(username, req, remember);
    if (req.headers.accept?.includes('text/html')) {
      res.statusCode = 303;
      res.setHeader('Location', role === 'admin' ? '/webgis.html' : '/peta.html');
      res.setHeader('Set-Cookie', cookie);
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    return json(res, 200, { authenticated: true, role }, { 'Set-Cookie': cookie });
  } catch (error) {
    if (error instanceof DatabaseError) {
      console.error('Login database error:', error.message);
      return json(res, error.status, { error: error.message });
    }
    console.error('Login API configuration error:', error.message);
    return json(res, 500, { error: 'Autentikasi belum dikonfigurasi dengan benar.' });
  }
};
