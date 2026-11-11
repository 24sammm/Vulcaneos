async function sendAccessRequest(details, siteOrigin) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    const error = new Error('Alamat tujuan belum dikonfigurasi. Admin perlu mengatur ADMIN_EMAIL.');
    error.statusCode = 503;
    throw error;
  }

  let origin;
  try {
    const url = new URL(siteOrigin);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol.');
    origin = url.origin;
  } catch {
    const error = new Error('Alamat asal situs tidak valid.');
    error.statusCode = 400;
    throw error;
  }

  const response = await fetch(`https://formsubmit.co/ajax/${adminEmail}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: origin,
      Referer: `${origin}/register.html`,
    },
    body: JSON.stringify({
      _subject: `Permohonan akses VULCANEOS — ${details.name}`,
      _template: 'table',
      _replyto: details.email,
      Nama: details.name,
      Instansi: details.institution,
      Email: details.email,
      'ID pengguna yang diajukan': details.username,
      'Keperluan akses': details.reason,
    }),
  });
  const result = await response.json();
  if (!response.ok || result.success !== true && result.success !== 'true') {
    const activationRequired = /activation/i.test(String(result.message || ''));
    const error = new Error(activationRequired
      ? 'FormSubmit belum aktif. Layanan melaporkan email aktivasi telah dikirim; permohonan belum disampaikan ke admin.'
      : 'FormSubmit menolak permohonan. Email belum dikirim.');
    error.statusCode = activationRequired ? 409 : 502;
    throw error;
  }
}

module.exports = { sendAccessRequest };
