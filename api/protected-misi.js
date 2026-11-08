const fs = require('node:fs');
const path = require('node:path');
const { getSession } = require('../lib/auth');

module.exports = (req, res) => {
  try {
    if (!getSession(req)) {
      res.statusCode = 302;
      res.setHeader('Location', '/login.html');
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(fs.readFileSync(path.join(process.cwd(), 'misi.html')));
  } catch (error) {
    console.error('Mission route error:', error.message);
    res.statusCode = 500;
    return res.end('Misi tidak dapat dimuat.');
  }
};
