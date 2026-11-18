const { adminUsers, json, users } = require('../lib/auth');
const { DatabaseError, isConfigured, registerUser } = require('../lib/db');

function trimmedText(value, min, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length < min || text.length > max ? null : text;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'POST' });
  }

  try {
    if (!isConfigured()) {
      return json(res, 503, { error: 'Registrasi belum tersedia. Database belum dikonfigurasi.' });
    }

    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      return json(res, 403, { error: 'Permintaan tidak diizinkan.' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof body.website === 'string' && body.website.trim()) {
      return json(res, 400, { error: 'Permintaan registrasi tidak valid.' });
    }

    const name = trimmedText(body.name, 2, 80);
    const institution = typeof body.institution === 'string' ? body.institution.trim() : '';
    const email = trimmedText(body.email, 3, 254);
    const username = trimmedText(body.username, 3, 32);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!name) return json(res, 400, { error: 'Nama harus 2–80 karakter.' });
    if (institution.length > 120) return json(res, 400, { error: 'Instansi maksimal 120 karakter.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Masukkan alamat email yang valid.' });
    }
    if (!username || !/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
      return json(res, 400, { error: 'ID pengguna harus 3–32 karakter: huruf, angka, titik, _ atau -.' });
    }
    if (password.length < 10 || password.length > 128) {
      return json(res, 400, { error: 'Kata sandi harus 10–128 karakter.' });
    }
    if (password !== body.confirmPassword) {
      return json(res, 400, { error: 'Konfirmasi kata sandi tidak cocok.' });
    }

    const reservedUsernames = [...users().map((user) => user.id), ...adminUsers()];
    if (reservedUsernames.some((reserved) => reserved.toLowerCase() === username.toLowerCase())) {
      return json(res, 409, { error: 'ID pengguna tidak tersedia.' });
    }

    const account = await registerUser({ username, email, name, institution, password });
    return json(res, 201, { registered: true, username: account.username });
  } catch (error) {
    if (error instanceof DatabaseError) return json(res, error.status, { error: error.message });
    console.error('Registration API error:', error.message);
    return json(res, 500, { error: 'Registrasi tidak dapat diproses.' });
  }
};
