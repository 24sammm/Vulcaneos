const { json } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'GET' });
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return json(res, 503, { error: 'Alamat tujuan belum dikonfigurasi. Admin perlu mengatur ADMIN_EMAIL.' });
  }
  return json(res, 200, { endpoint: `https://formsubmit.co/ajax/${adminEmail}` });
};
