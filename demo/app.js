const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const pino = require('pino');
const { createApp } = require('../app');
const { createMemoryStore } = require('../adapters/memoryStore');
const { createDemoGemini } = require('./gemini');
const { seed } = require('../scripts/seed-question-bank');
const { seedUser } = require('./seed');
const { asyncHandler, errorHandler } = require('../middleware/errors');
const loopback = host => ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(host);
async function createDemoApp({ frontend = true, env = process.env, logger = pino({ level: 'silent' }) } = {}) {
  if (env.NODE_ENV === 'production') throw new Error('Offline demo cannot run in production mode');
  const store = createMemoryStore(), tokens = new Map(), gemini = createDemoGemini();
  await seed(store.db);
  function remove(token) {
    const identity = tokens.get(token); tokens.delete(token);
    if (identity) for (const [key, value] of store.records) if (key.startsWith(`users/${identity.uid}/`) || (key.startsWith('interviewSessions/') && value.ownerUid === identity.uid)) store.records.delete(key);
  }
  const firebase = { firestore: () => store.db, auth: () => ({ async verifyIdToken(token) {
    const identity = tokens.get(token);
    if (!identity || identity.expiresAt <= Date.now()) { remove(token); throw new Error('Invalid demo session'); }
    return { uid: identity.uid, admin: false, email: 'synthetic@example.test' };
  } }) };
  // Pass only an explicit safe runtime configuration. Never load .env, credentials or production adapters.
  const product = createApp({ env: { NODE_ENV: 'development', SESSION_SECRET: randomBytes(48).toString('hex'), CHROMIUM_EXECUTABLE_PATH: env.CHROMIUM_EXECUTABLE_PATH, CHROMIUM_NO_SANDBOX: env.CHROMIUM_NO_SANDBOX }, frontend, firebase, gemini, logger, sessionName: 'prepto.demo.sid', authCookieName: 'prepto_demo_token' });
  product.locals.demoMode = true;
  const app = express(); app.locals.logger = logger;
  app.set('views', path.join(__dirname, '../views')); app.set('view engine', 'ejs');
  app.use((req, res, next) => {
    req.log = logger;
    if (!loopback(req.hostname) || !loopback(req.socket.remoteAddress)) return res.status(403).json({ error: 'Offline demo is loopback-only' });
    res.set('X-Prepto-Mode', 'offline-demo'); res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-origin request rejected' });
      if (req.get('origin')) { try { if (new URL(req.get('origin')).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request rejected' }); } catch { return res.status(403).json({ error: 'Invalid origin' }); } }
    }
    next();
  });
  app.use(cookieParser());
  app.get(['/login','/register','/forgot-password'], (_req, res) => res.redirect('/demo'));
  app.get('/', (req, res, next) => frontend === false ? res.redirect('/demo') : next());
  app.get('/demo', (req, res, next) => product.locals.renderFrontend ? Promise.resolve(product.locals.renderFrontend(req, res)).catch(next) : res.render('demo', { demoMode: true, currentPath: '/demo' }));
  app.post('/demo/start', express.urlencoded({ extended: false, limit: '1kb' }), asyncHandler(async (req, res) => {
    remove(req.cookies.prepto_demo_token);
    for (const [token, identity] of tokens) if (identity.expiresAt <= Date.now()) remove(token);
    if (tokens.size >= 20) return res.status(429).send('Demo session limit reached. Exit an existing demo or restart this local process.');
    const uid = `demo-${randomUUID()}`, token = `demo-${randomBytes(32).toString('hex')}`;
    tokens.set(token, { uid, expiresAt: Date.now() + 3600000 });
    try { await seedUser(store.db, gemini, uid); } catch (error) { remove(token); throw error; }
    res.cookie('prepto_demo_token', token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 3600000 }); res.redirect('/dashboard');
  }));
  app.get(['/demo/exit','/logout'], (_req, res) => res.redirect('/demo'));
  app.post('/demo/exit', (req, res) => { remove(req.cookies.prepto_demo_token); res.clearCookie('prepto_demo_token', { path: '/' }); res.clearCookie('prepto.demo.sid', { path: '/' }); res.redirect('/demo'); });
  // Restrict demo to the reviewed offline product flows. No production login/token exchange, profiles or legacy remote tools.
  app.use((req, res, next) => {
    const allowedPage = /^\/(dashboard|question-bank|interviews|resumes|resume-matches|coding-practice|progress|reports)(\/|$)/.test(req.path) && req.path !== '/progress/legacy';
    const allowedApi = /^\/api\/(runtime|session|profile|questions|bookmarks|interviews|resumes|resume-matches|coding|progress|admin|reports)(\/|$)/.test(req.path);
    const asset = /^\/(stylesheet\/product\.css|productCommon\.js|questionBank\.js|interviews\.js|interviewSession\.js|resumes\.js|resumeVersions\.js|resumeMatches\.js|codingPractice\.js|progressProduct\.js|health)$/.test(req.path);
    const frontendAsset = frontend !== false && (/^\/assets\/[a-zA-Z0-9_.-]+$/.test(req.path) || (frontend?.vite && /^\/(src\/|@vite\/|@fs\/|node_modules\/|@id\/)/.test(req.path)));
    if (req.path !== '/' && !allowedPage && !allowedApi && !asset && !frontendAsset) return res.status(404).send('This route is not part of the isolated offline demo. Return to /demo.');
    next();
  });
  app.use(product); app.use(errorHandler);
  return { app, store };
}
module.exports = { createDemoApp, loopback };
