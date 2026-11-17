const { getSession, json } = require('../lib/auth');
const { isConfigured, getProfile, updateProfile, DatabaseError } = require('../lib/db');

function clean(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > maxLength ? null : trimmed;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'GET, PUT, PATCH' });
  }
  try {
    if (!isConfigured()) {
      return json(res, 503, { error: 'Database belum dikonfigurasi. Admin perlu mengatur MONGODB_URI.' });
    }
    const session = getSession(req);
    if (!session) return json(res, 401, { error: 'Masuk terlebih dahulu untuk mengakses profil.' });

    if (req.method === 'GET') {
      const profile = await getProfile(session.sub);
      if (!profile) return json(res, 404, { error: 'Profil tidak ditemukan.' });
      return json(res, 200, { profile });
    }

    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Permintaan tidak diizinkan.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const name = clean(body.name, 80);
    const institution = clean(body.institution ?? '', 120);
    const bio = clean(body.bio ?? '', 400);
    if (!name || name.length < 2) return json(res, 400, { error: 'Nama profil harus 2–80 karakter.' });
    if (institution === null) return json(res, 400, { error: 'Instansi maksimal 120 karakter.' });
    if (bio === null) return json(res, 400, { error: 'Bio maksimal 400 karakter.' });

    const profile = await updateProfile(session.sub, { name, institution, bio });
    if (!profile) return json(res, 404, { error: 'Profil tidak ditemukan.' });
    return json(res, 200, { profile });
  } catch (error) {
    if (error instanceof DatabaseError) return json(res, error.status, { error: error.message });
    console.error('Profile API error:', error.message);
    return json(res, 500, { error: 'Profil tidak dapat diproses.' });
  }
};
