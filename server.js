const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { profileFor } = require('./lib/auth');

const ROOT = __dirname;
const JSON_DIR = path.join(ROOT, 'JSON');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) throw new Error('Missing .env file.');
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) return;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  });
}

loadEnvFile();

const AUTH_USERS = String(process.env.AUTH_USERS || `${process.env.AUTH_ID || ''}:${process.env.AUTH_PASSWORD || ''}`)
  .split(',').map((item) => {
    const separator = item.indexOf(':');
    return separator < 1 ? null : { id: item.slice(0, separator).trim(), password: item.slice(separator + 1) };
  }).filter((user) => user?.id && user.password);
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_TTL_SECONDS = Math.max(300, Number(process.env.SESSION_TTL_SECONDS || 28800));
const REMEMBER_TTL_SECONDS = Math.max(SESSION_TTL_SECONDS, Number(process.env.REMEMBER_TTL_SECONDS || 2592000));
const COOKIE_NAME = 'kw_session';

if (!AUTH_USERS.length || !SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('AUTH_USERS and a 32-character AUTH_SESSION_SECRET are required in .env.');
}

const loginAttempts = new Map();
const allowedRootFiles = new Set(['index.html', 'peta.html', 'tentang.html', 'login.html', 'register.html', 'webgis.html', 'misi.html', 'game.html', 'latar-belakang.html', 'tujuan.html', 'krakatau.jpg', 'krakatauanak.jpg', 'petadatar.jpg', 'petadasar1.jpg', 'backgroundphotobooth.jpg', 'style.css', 'landing-v2.css', 'pages.css', 'public-map.css', 'public-map.js', 'download-modal.css', 'logo.css', 'volcanoes-transparent.png', 'volcanoes-favicon.png', 'volcanoes-favicon-32.png', 'photoboothtemp1.jpeg', 'photoboothtemp2.jpeg', 'app.js', 'auth.js', 'landing.js', 'photo-booth.css', 'photo-booth.js', 'game.css', 'game.js']);

function jsonResponse(response, status, body, extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': MIME_TYPES['.json'], 'Cache-Control': 'no-store', ...extraHeaders });
  response.end(JSON.stringify(body));
}

function constantTimeMatch(value, expected) {
  const actualDigest = crypto.createHash('sha256').update(String(value)).digest();
  const expectedDigest = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function signatureFor(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function makeSessionCookie(secure, ttl, userId) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttl })).toString('base64url');
  const token = `${payload}.${signatureFor(payload)}`;
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttl}${secure ? '; Secure' : ''}`;
}

function isSecureRequest(request) {
  return Boolean(request.socket.encrypted) || request.headers['x-forwarded-proto'] === 'https';
}

function sessionCookie(request, clear = false, ttl = SESSION_TTL_SECONDS, userId = AUTH_USERS[0]?.id) {
  const secure = process.env.NODE_ENV === 'production' || isSecureRequest(request);
  return clear
    ? `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`
    : makeSessionCookie(secure, ttl, userId);
}

function readSession(request) {
  const cookieHeader = request.headers.cookie || '';
  const token = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!token) return null;
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = signatureFor(payload);
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  const expected = Buffer.from(expectedSignature, 'base64url');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!AUTH_USERS.some((user) => user.id === session.sub) || !Number.isFinite(session.exp) || session.exp <= Date.now() / 1000) return null;
    return session;
  } catch {
    return null;
  }
}

function requestIp(request) {
  return request.socket.remoteAddress || 'unknown';
}

function canAttemptLogin(request) {
  const now = Date.now();
  const key = requestIp(request);
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > 15 * 60 * 1000) {
    loginAttempts.set(key, { startedAt: now, count: 0 });
    return true;
  }
  return entry.count < 10;
}

function recordFailedLogin(request) {
  const now = Date.now();
  const key = requestIp(request);
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > 15 * 60 * 1000) loginAttempts.set(key, { startedAt: now, count: 1 });
  else entry.count += 1;
}

function clearFailedLogins(request) {
  loginAttempts.delete(requestIp(request));
}

function readJsonBody(request, limit = 8192) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON.')); }
    });
    request.on('error', reject);
  });
}

function serveFile(request, response, file) {
  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': path.extname(file) === '.html' ? 'no-store' : 'public, max-age=300',
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (request.method === 'GET' && pathname === '/api/cesium-config') {
    jsonResponse(response, 200, { ionToken: process.env.CESIUM_ION_TOKEN || '' });
    return;
  }

  if (request.method === 'GET' && (pathname === '/api/session' || pathname === '/api/me')) {
    const session = readSession(request);
    jsonResponse(response, 200, {
      authenticated: Boolean(session),
      user: session ? session.sub : null,
      profile: session ? profileFor(session.sub) : null,
    });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/access-request') {
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== request.headers.host) {
      jsonResponse(response, 403, { error: 'Permintaan tidak diizinkan.' });
      return;
    }
    try {
      const body = await readJsonBody(request);
      if (body.website) {
        jsonResponse(response, 200, { sent: true });
        return;
      }
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
        jsonResponse(response, 400, { error: 'Periksa kembali form. ID harus 3–32 karakter; kata sandi minimal 12 karakter, tanpa koma, dan konfirmasinya harus sama.' });
        return;
      }
      delete details.confirmPassword;
      await require('./lib/access-request').sendAccessRequest(details);
      jsonResponse(response, 200, { sent: true });
    } catch (error) {
      const status = error.statusCode || (error.message === 'Invalid JSON.' ? 400 : 502);
      jsonResponse(response, status, { error: error.statusCode === 503 ? error.message : 'Email permohonan gagal dikirim. Periksa konfigurasi email server.' });
    }
    return;
  }

  if (request.method === 'POST' && pathname === '/api/login') {
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== request.headers.host) {
      jsonResponse(response, 403, { error: 'Permintaan tidak diizinkan.' });
      return;
    }
    if (!canAttemptLogin(request)) {
      jsonResponse(response, 429, { error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const username = typeof body.username === 'string' ? body.username : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const user = AUTH_USERS.find((candidate) => constantTimeMatch(username, candidate.id) && constantTimeMatch(password, candidate.password));
      if (!user) {
        recordFailedLogin(request);
        jsonResponse(response, 401, { error: 'ID pengguna atau kata sandi tidak sesuai.' });
        return;
      }
      clearFailedLogins(request);
      const ttl = body.remember === true ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS;
      jsonResponse(response, 200, { authenticated: true }, { 'Set-Cookie': sessionCookie(request, false, ttl, user.id) });
    } catch (error) {
      jsonResponse(response, error.message === 'Invalid JSON.' ? 400 : 413, { error: 'Permintaan masuk tidak valid.' });
    }
    return;
  }

  if (request.method === 'POST' && pathname === '/api/logout') {
    jsonResponse(response, 200, { authenticated: false }, { 'Set-Cookie': sessionCookie(request, true) });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/register') {
    jsonResponse(response, 403, { error: 'Pendaftaran mandiri belum aktif.' });
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, POST', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }

  if (pathname === '/webgis.html' && !readSession(request)) {
    response.writeHead(302, { Location: '/login.html', 'Cache-Control': 'no-store' });
    response.end();
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveFile(request, response, path.join(ROOT, 'index.html'));
    return;
  }

  const staticName = pathname.replace(/^\//, '');
  if (allowedRootFiles.has(staticName)) {
    serveFile(request, response, path.join(ROOT, staticName));
    return;
  }

  if (pathname.startsWith('/JSON/')) {
    const name = pathname.slice('/JSON/'.length);
    if (!/^[A-Za-z0-9_-]+\.(?:json|geojson)$/i.test(name)) {
      response.writeHead(404);
      response.end();
      return;
    }
    const file = path.resolve(JSON_DIR, name);
    if (!file.startsWith(`${JSON_DIR}${path.sep}`)) {
      response.writeHead(404);
      response.end();
      return;
    }
    serveFile(request, response, file);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Krakatau Watch listening on ${HOST}:${PORT} (local: http://localhost:${PORT})\n`);
});
