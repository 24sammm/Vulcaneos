function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function sendAccessRequest(details) {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const fromEmail = process.env.MAIL_FROM;
  if (!apiKey || !adminEmail || !fromEmail) {
    const error = new Error('Pengiriman email belum dikonfigurasi. Admin perlu mengatur RESEND_API_KEY, ADMIN_EMAIL, dan MAIL_FROM.');
    error.statusCode = 503;
    throw error;
  }

  const name = escapeHtml(details.name);
  const email = escapeHtml(details.email);
  const institution = escapeHtml(details.institution);
  const username = escapeHtml(details.username);
  const password = escapeHtml(details.password);
  const reason = escapeHtml(details.reason);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      reply_to: details.email,
      subject: `Permohonan akses Krakatau Watch — ${details.name}`,
      text: `Permohonan akses Krakatau Watch\n\nNama: ${details.name}\nInstansi: ${details.institution}\nEmail: ${details.email}\nID yang diajukan: ${details.username}\nKata sandi pilihan: ${details.password}\nKeperluan: ${details.reason}`,
      html: `<h2>Permohonan akses Krakatau Watch</h2><p><b>Nama:</b> ${name}</p><p><b>Instansi:</b> ${institution}</p><p><b>Email:</b> ${email}</p><p><b>ID yang diajukan:</b> ${username}</p><p><b>Kata sandi pilihan:</b> ${password}</p><p><b>Keperluan:</b> ${reason}</p>`,
    }),
  });
  if (!response.ok) {
    const error = new Error('Layanan email gagal mengirim permohonan. Periksa konfigurasi email server.');
    error.statusCode = 502;
    throw error;
  }
}

module.exports = { sendAccessRequest };
