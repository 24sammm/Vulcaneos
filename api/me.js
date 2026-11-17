const { getSession, profileFor, isAdmin, json } = require('../lib/auth');
const { isConfigured, getProfile, DatabaseError } = require('../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Metode tidak diizinkan.' }, { Allow: 'GET' });
  try {
    const session = getSession(req);
    if (!session) {
      return json(res, 200, { authenticated: false, user: null, profile: null, role: null });
    }
    if (isConfigured()) {
      const profile = await getProfile(session.sub);
      if (profile) {
        return json(res, 200, {
          authenticated: true,
          user: session.sub,
          profile,
          role: profile.role,
        });
      }
    }
    return json(res, 200, {
      authenticated: true,
      user: session.sub,
      profile: profileFor(session.sub),
      role: isAdmin(session.sub) ? 'admin' : 'user',
    });
  } catch (error) {
    if (error instanceof DatabaseError) {
      console.error('Session database error:', error.message);
      return json(res, error.status, { error: error.message });
    }
    console.error('Session API configuration error:', error.message);
    return json(res, 500, { error: 'Autentikasi belum dikonfigurasi dengan benar.' });
  }
};
