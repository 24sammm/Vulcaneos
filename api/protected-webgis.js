const fs = require('node:fs');
const path = require('node:path');
const { getSession, isAdmin } = require('../lib/auth');

module.exports = (req, res) => {
  try {
    const session = getSession(req);
    if (!session || !isAdmin(session.sub)) {
      res.statusCode = 302;
      res.setHeader('Location', session ? '/peta.html' : '/login.html');
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(fs.readFileSync(path.join(process.cwd(), 'webgis.html')));
  } catch (error) {
    console.error('Dashboard route error:', error.message);
    res.statusCode = 500;
    return res.end('Dashboard tidak dapat dimuat.');
  }
};
