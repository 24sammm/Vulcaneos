const { sendAccessRequest } = require('../lib/access-request');
const { json } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'POST' });
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Permintaan tidak diizinkan.' });

  const body = req.body || {};
  if (body.website) return json(res, 200, { sent: true });
  const details = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    institution: typeof body.institution === 'string' ? body.institution.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    username: typeof body.username === 'string' ? body.username.trim() : '',
    password: typeof body.password === 'string' ? body.password : '',
    confirmPassword: typeof body.confirmPassword === 'string' ? body.confirmPassword : '',
    reason: typeof body.reason === 'string' ? body.reason.trim() : '',
  };
  if (!details.name || details.name.length > 120 || !details.institution || details.institution.length > 160
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) || details.email.length > 254
    || !/^[A-Za-z0-9._-]{3,32}$/.test(details.username) || details.password.length < 12 || details.password.length > 128
    || details.password.includes(',') || details.password !== details.confirmPassword
    || !details.reason || details.reason.length > 300) {
    return json(res, 400, { error: 'Periksa kembali form. ID harus 3–32 karakter; kata sandi minimal 12 karakter, tanpa koma, dan konfirmasinya harus sama.' });
  }
  delete details.confirmPassword;

  try {
    await sendAccessRequest(details);
    return json(res, 200, { sent: true });
  } catch (error) {
    console.error('Access request email error:', error.message);
    return json(res, error.statusCode || 502, { error: error.statusCode === 503 ? error.message : 'Email permohonan gagal dikirim. Coba lagi nanti.' });
  }
};
