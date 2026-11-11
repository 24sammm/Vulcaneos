const crypto = require('node:crypto');

const COOKIE = 'kw_session';
const SESSION_TTL = Math.max(300, Number(process.env.SESSION_TTL_SECONDS || 28800));
const REMEMBER_TTL = Math.max(SESSION_TTL, Number(process.env.REMEMBER_TTL_SECONDS || 2592000));

function users() {
  return String(process.env.AUTH_USERS || '').split(',').map((item) => {
    const separator = item.indexOf(':');
    if (separator < 1) return null;
    return { id: item.slice(0, separator).trim(), password: item.slice(separator + 1) };
  }).filter((user) => user?.id && user.password);
}

function adminUsers() {
  const configuredAdmins = String(process.env.AUTH_ADMIN_USERS || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (configuredAdmins.length || process.env.NODE_ENV === 'production') return configuredAdmins;
  return users().slice(0, 1).map((user) => user.id);
}

function isAdmin(id) {
  return adminUsers().includes(id);
}

function profileFor(id) {
  let profiles = {};
  try { profiles = JSON.parse(process.env.AUTH_PROFILES || '{}'); } catch { /* Use a safe fallback for invalid optional profile config. */ }
  const profile = profiles && typeof profiles === 'object' ? profiles[id] : null;
  return {
    name: typeof profile?.name === 'string' && profile.name.trim() ? profile.name.trim() : id,
    institution: typeof profile?.institution === 'string' && profile.institution.trim() ? profile.institution.trim() : 'Pengguna Krakatau Watch',
  };
}

function secret() {
  const value = process.env.AUTH_SESSION_SECRET || '';
  if (value.length < 32) throw new Error('AUTH_SESSION_SECRET must contain at least 32 characters.');
  return value;
}

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function getSession(req) {
  const token = String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload), 'base64url');
  const supplied = Buffer.from(signature, 'base64url');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isFinite(session.exp) || session.exp <= Date.now() / 1000) return null;
    if (!users().some((user) => user.id === session.sub)) return null;
    return session;
  } catch { return null; }
}

function createCookie(id, req, remember = false) {
  const ttl = remember ? REMEMBER_TTL : SESSION_TTL;
  const payload = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + ttl })).toString('base64url');
  const secure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttl}${secure ? '; Secure' : ''}`;
}

function clearCookie(req) {
  const secure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
  res.end(JSON.stringify(body));
}

module.exports = { users, adminUsers, isAdmin, profileFor, safeEqual, getSession, createCookie, clearCookie, json };
