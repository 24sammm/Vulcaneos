const { sendAccessRequest } = require('../lib/access-request');
const { json } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'POST' });
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Permintaan tidak diizinkan.' });

  const rawBody = req.body;
  const body = rawBody && typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)
    ? rawBody
    : typeof rawBody === 'string' || Buffer.isBuffer(rawBody)
      ? Object.fromEntries(new URLSearchParams(rawBody.toString()))
      : {};
  if (body.website) return json(res, 200, { sent: true });
  let siteOrigin;
  try {
    siteOrigin = new URL(origin || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`).origin;
  } catch {
    return json(res, 400, { error: 'Alamat asal situs tidak valid.' });
  }
  const details = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    institution: typeof body.institution === 'string' ? body.institution.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    username: typeof body.username === 'string' ? body.username.trim() : '',
    reason: typeof body.reason === 'string' ? body.reason.trim() : '',
  };
  if (!details.name || details.name.length > 120 || !details.institution || details.institution.length > 160
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) || details.email.length > 254
    || !/^[A-Za-z0-9._-]{3,32}$/.test(details.username) || !details.reason || details.reason.length > 300) {
    return json(res, 400, { error: 'Periksa kembali nama, instansi, email, ID pengguna, dan keperluan akses.' });
  }

  try {
    await sendAccessRequest(details, siteOrigin);
    return json(res, 200, { sent: true });
  } catch (error) {
    console.error('Access request email error:', {
      message: error.message,
      providerMessage: error.providerMessage || null,
    });
    const safeError = [400, 409, 503].includes(error.statusCode)
      ? error.message
      : 'FormSubmit menolak permohonan. Email belum dikirim; periksa konfigurasi dan coba lagi.';
    const providerMessage = error.statusCode === 502 && error.providerMessage
      ? ` Alasan dari FormSubmit: ${error.providerMessage}`
      : '';
    return json(res, error.statusCode || 502, { error: `${safeError}${providerMessage}` });
  }
};
