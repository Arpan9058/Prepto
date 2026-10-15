const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
function frontendRenderer(app, frontend) {
  if (frontend === false) return null;
  const root = path.join(__dirname, '../frontend');
  if (frontend?.vite) {
    app.use(frontend.vite.middlewares);
    return async (req, res) => { res.set('Cache-Control', 'no-store'); res.type('html').send(await frontend.vite.transformIndexHtml(req.originalUrl, fs.readFileSync(path.join(root, 'index.html'), 'utf8'))); };
  }
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('React frontend build missing. Run npm run build before starting.');
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  return (_req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(dist, 'index.html')); };
}
module.exports = { frontendRenderer };
