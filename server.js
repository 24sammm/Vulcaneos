const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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

const { getSession, isAdmin } = require('./lib/auth');
const API_ROUTES = {
  '/api/login': require('./api/login'),
  '/api/register': require('./api/register'),
  '/api/logout': require('./api/logout'),
  '/api/me': require('./api/me'),
  '/api/session': require('./api/me'),
  '/api/profile': require('./api/profile'),
  '/api/forum': require('./api/forum'),
  '/api/admin/users': require('./api/admin/users'),
};

const AUTH_USERS = String(process.env.AUTH_USERS || `${process.env.AUTH_ID || ''}:${process.env.AUTH_PASSWORD || ''}`)
  .split(',').map((item) => {
    const separator = item.indexOf(':');
    return separator < 1 ? null : { id: item.slice(0, separator).trim(), password: item.slice(separator + 1) };
  }).filter((user) => user?.id && user.password);
const SESSION_SECRET = process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

if (!AUTH_USERS.length || !SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('AUTH_USERS and a 32-character AUTH_SESSION_SECRET are required in .env.');
}

const allowedRootFiles = new Set(['index.html', 'peta.html', 'tentang.html', 'login.html', 'register.html', 'webgis.html', 'admin-users.html', 'admin-users.css', 'admin-users.js', 'misi.html', 'game.html', 'sumber.html', 'latar-belakang.html', 'tujuan.html', 'simulasi.html', 'krakatau.jpg', 'krakatauanak.jpg', 'petadatar.jpg', 'petadasar1.jpg', 'backgroundphotobooth.jpg', 'style.css', 'landing-v2.css', 'pages.css', 'home-theme.css', 'public-map.css', 'public-map.js', 'download-modal.css', 'logo.css', 'volcanoes-transparent.png', 'volcanoes-favicon.png', 'volcanoes-favicon-32.png', 'photoboothtemp1.jpeg', 'photoboothtemp2.jpeg', 'edukasi1.jpeg', 'edukasi2.jpeg', 'edukasi3.jpeg', 'pemetaanVulkanik.jpeg', 'app.js', 'auth-client.js', 'landing.js', 'forum.js', 'photo-booth.css', 'photo-booth.js', 'game.css', 'game.js', 'simulasi.css', 'simulasi.js', 'simulasi-scene.js']);

function jsonResponse(response, status, body, extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': MIME_TYPES['.json'], 'Cache-Control': 'no-store', ...extraHeaders });
  response.end(JSON.stringify(body));
}

function readJsonBody(request, limit = 24000) {
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

  if (request.method === 'GET' && pathname === '/api/access-request') {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      jsonResponse(response, 503, { error: 'Alamat tujuan belum dikonfigurasi. Admin perlu mengatur ADMIN_EMAIL.' });
      return;
    }
    jsonResponse(response, 200, { endpoint: `https://formsubmit.co/ajax/${adminEmail}` });
    return;
  }

  const apiHandler = API_ROUTES[pathname];
  if (apiHandler) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        request.body = await readJsonBody(request);
      } catch (error) {
        jsonResponse(response, error.message === 'Invalid JSON.' ? 400 : 413, {
          error: error.message === 'Invalid JSON.' ? 'Permintaan tidak valid.' : 'Permintaan terlalu besar.',
        });
        return;
      }
    }
    try {
      await apiHandler(request, response);
    } catch (error) {
      console.error(`API ${pathname} failed:`, error.message);
      if (!response.headersSent) jsonResponse(response, 500, { error: 'Permintaan tidak dapat diproses.' });
      else response.end();
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, POST', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }

  if (pathname === '/webgis.html') {
    const session = getSession(request);
    if (!session || !isAdmin(session.sub)) {
      response.writeHead(302, { Location: session ? '/peta.html' : '/login.html', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
  }

  if (pathname === '/admin-users.html') {
    const session = getSession(request);
    if (!session || !isAdmin(session.sub)) {
      response.writeHead(302, { Location: session ? '/index.html' : '/login.html', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
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
  process.stdout.write(`Vulcaneos listening on ${HOST}:${PORT} (local: http://localhost:${PORT})\n`);
});
