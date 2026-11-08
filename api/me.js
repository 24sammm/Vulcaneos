const { getSession, profileFor, json } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'GET' });
  try {
    const session = getSession(req);
    return json(res, 200, {
      authenticated: Boolean(session),
      user: session?.sub || null,
      profile: session ? profileFor(session.sub) : null,
    });
  } catch (error) {
    console.error('Session API configuration error:', error.message);
    return json(res, 500, { error: 'Autentikasi belum dikonfigurasi dengan benar.' });
  }
};
