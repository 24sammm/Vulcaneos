const { clearCookie, json } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'POST' });
  return json(res, 200, { authenticated: false }, { 'Set-Cookie': clearCookie(req) });
};
