const fs = require('node:fs');
const path = require('node:path');
const { getSession, isAdmin } = require('../lib/auth');

module.exports = (req, res) => {
  try {
    const page = req.query?.page || new URL(req.url, 'http://localhost').searchParams.get('page');
    const adminUsersPage = page === 'admin-users';
    const session = getSession(req);
    if (!session || !isAdmin(session.sub)) {
      res.statusCode = 302;
      res.setHeader('Location', session ? (adminUsersPage ? '/index.html' : '/peta.html') : '/login.html');
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const file = adminUsersPage ? 'admin-users.html' : 'webgis.html';
    return res.end(fs.readFileSync(path.join(process.cwd(), file)));
  } catch (error) {
    console.error('Protected page route error:', error.message);
    res.statusCode = 500;
    return res.end('Halaman tidak dapat dimuat.');
  }
};
