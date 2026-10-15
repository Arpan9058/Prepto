const express = require('express');
const path = require('node:path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pino = require('pino');
const pinoHttp = require('pino-http');
const ejs = require('ejs');
const { renderResponse } = require('./utils/legacyResponse');
const firebaseDefault = require('./firebase');
const { createGemini } = require('./adapters/gemini');
const { ensureAuthenticated } = require('./middleware/auth');
const { asyncHandler, httpError, errorHandler } = require('./middleware/errors');
const { markdown, safeHtml } = require('./utils/reports');
const ats = require('./ats');
const { exportPdf } = require('./resumeGenerator');
const { createMockRouter } = require('./routes/mockInterview');
const { createReportsRouter } = require('./routes/reports');
const { createProgressRouter } = require('./routes/progress');
const { createHrRouter } = require('./routes/hrRound');
const { createTechnicalRouter } = require('./routes/Technical');
const { createCodingRouter } = require('./routes/codingTest');
const { FirestoreSessionStore } = require('./adapters/sessionStore');
function createApp({ env = process.env, firebase = firebaseDefault, gemini = createGemini({ env }),
  frontend = true, pdf = exportPdf, sessionStore, sessionName = 'prepto.sid', authCookieName = 'session_token', logger = pino({ level: env.LOG_LEVEL || 'info' }) } = {}) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.locals.authCookieName = authCookieName;
  app.locals.firebase = firebase;
  app.locals.gemini = gemini;
  app.locals.pdf = html => pdf(html, { env });
  app.locals.logger = logger;
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use((req, res, next) => { res.locals.currentPath = req.path; res.locals.demoMode = app.locals.demoMode === true; next(); });
  app.use(pinoHttp({ logger, serializers: { req: req => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }), res: res => ({ statusCode: res.statusCode }) } }));
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'same-origin'); next(); });
  app.use(cookieParser());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(session({ name: sessionName, secret: env.SESSION_SECRET, resave: false, saveUninitialized: false,
    store: sessionStore || (env.NODE_ENV === 'production' ? new FirestoreSessionStore(firebase) : undefined),
    cookie: { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 3600000 } }));
  // Reject cross-origin cookie-authenticated mutations. Bearer clients do not rely on cookies.
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.headers.authorization) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-origin request rejected' });
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin request rejected' }); }
        catch { return res.status(403).json({ error: 'Invalid origin' }); }
      }
    }
    next();
  });
  const renderFrontend = require('./middleware/frontend').frontendRenderer(app, frontend);
  app.locals.renderFrontend = renderFrontend;
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', require('./routes/workspace').createWorkspaceRouter({ env }));
  if (renderFrontend) {
    app.get(['/', '/login', '/register', '/forgot-password'], asyncHandler(renderFrontend));
    app.get('/progress/legacy', ensureAuthenticated, (_req, res) => res.redirect('/progress'));
    app.get(['/mock-interviews', '/hr-round', '/technical-round', '/technical-round/{*path}', '/coding-test', '/coding-test/question/:id', '/coding-test/results', '/api/mockTest', '/analyze', '/resume-interview', '/careerguidance', '/resume-builder'], ensureAuthenticated, (req, res, next) => req.get('accept')?.includes('application/json') ? next() : asyncHandler(renderFrontend)(req, res, next));
    app.get(['/dashboard', '/onboarding', '/question-bank', '/interviews', '/interviews/:id', '/resumes', '/resumes/:id', '/resume-matches', '/coding-practice', '/progress', '/reports', '/reports/view/:id'], ensureAuthenticated, asyncHandler(renderFrontend));
  }
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  for (const [url, view] of [['/', 'index'], ['/login', 'login'], ['/register', 'register'], ['/forgot-password', 'forgotPassword']]) app.get(url, (_req, res) => res.render(view));
  for (const [url, view] of [['/dashboard', 'dashboard'], ['/analyze', 'ATS_JDandRESUME'], ['/resume-interview', 'resumeAnalysis'], ['/mock-interviews', 'mockInterviews'], ['/careerguidance', 'careerGuidance'], ['/resume-builder', 'resumeBuilder']]) app.get(url, ensureAuthenticated, (req, res) => res.render(view, { user: req.user }));
  app.post('/api/set-token', (req, res, next) => req.headers.authorization?.match(/^Bearer (.+)$/) ? next() : res.status(401).json({ error: 'Bearer token required' }), ensureAuthenticated, asyncHandler(async (req, res) => {
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.ownerUid = req.user.uid;
    res.cookie(authCookieName, req.headers.authorization.match(/^Bearer (.+)$/)[1], { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 3600000 });
    res.json({ success: true });
  }));
  app.post('/api/store-user', ensureAuthenticated, asyncHandler(async (req, res) => {
    const ref = firebase.firestore().collection('users').doc(req.user.uid);
    const { fullName, mobile } = req.body;
    if (typeof fullName !== 'string' || fullName.length > 200 || typeof mobile !== 'string' || mobile.length > 40) throw httpError(400, 'Invalid profile');
    await firebase.firestore().runTransaction(async tx => {
      if (!(await tx.get(ref)).exists) tx.set(ref, { fullName, mobile, email: req.user.email || '', createdAt: new Date() });
    });
    res.json({ success: true });
  }));
  app.get('/logout', (req, res, next) => req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie(authCookieName, { path: '/' }); res.clearCookie(sessionName, { path: '/' }); res.redirect('/');
  }));
  app.post('/analyze', ensureAuthenticated, ats.upload.single('resume'), asyncHandler(async (req, res) => {
    if (typeof req.body.jobDescription !== 'string' || !req.body.jobDescription.trim()) throw httpError(400, 'Job description is required');
    const text = await ats.extractTextFromFile(req.file);
    const result = await ats.analyzeWithGemini(text, req.body.jobDescription, gemini);
    renderResponse(req, res, 'ATSResult', { analysis: markdown(result) });
  }));
  app.post('/resume-interview', ensureAuthenticated, ats.upload.single('resume'), asyncHandler(async (req, res) => {
    const text = await ats.extractTextFromFile(req.file);
    const result = await require('./routes/resumeAnalysis').generateInterviewQuestions(text, gemini);
    renderResponse(req, res, 'resumeInterviewResult', { questions: markdown(result) });
  }));
  app.post('/career-guidance', ensureAuthenticated, asyncHandler(async (req, res) => {
    if (typeof req.body.skills !== 'string' || !req.body.skills.trim()) throw httpError(400, 'Skills are required');
    renderResponse(req, res, 'careerResult', { careerGuidance: markdown(await require('./careerGuidance').analyzeWithGemini(req.body.skills, gemini)) });
  }));
  app.post('/generate-resume', ensureAuthenticated, asyncHandler(async (req, res) => {
    const keys = ['fullName', 'location', 'email', 'phone', 'links', 'objective', 'education', 'projects', 'skills', 'tools', 'core', 'experience', 'certifications', 'competitive'];
    const data = Object.fromEntries(keys.map(key => [key, typeof req.body[key] === 'string' ? req.body[key] : '']));
    if (!data.fullName.trim()) throw httpError(400, 'Full name is required');
    const html = await ejs.renderFile(path.join(__dirname, 'views/Resume.ejs'), data);
    // Ownership is bound to this authenticated session, never to a client filename.
    req.session.resumeContent = html;
    renderResponse(req, res, 'resumeResult', { resumeContent: safeHtml(html) });
  }));
  app.get('/download-resume', ensureAuthenticated, asyncHandler(async (req, res) => {
    if (!req.session.resumeContent) throw httpError(400, 'No resume to download');
    const buffer = await app.locals.pdf(req.session.resumeContent);
    res.attachment('resume.pdf').type('application/pdf').send(buffer);
  }));
  app.get('/coding-practice', ensureAuthenticated, (_req, res) => res.render('codingPractice'));
  app.use('/api', require('./routes/codingPractice').createCodingPracticeRouter());
  app.get('/question-bank', ensureAuthenticated, (req, res) => res.render('questionBank', { user: req.user, ...require('./utils/product') }));
  app.get('/interviews', ensureAuthenticated, (_req, res) => res.render('interviews'));
  app.get('/interviews/:id', ensureAuthenticated, (req, res) => res.render('interviewSession', { sessionId: require('./utils/product').id(req.params.id) }));
  app.get('/resume-matches', ensureAuthenticated, (_req, res) => res.render('resumeMatches'));
  app.use('/api', require('./routes/resumeMatches').createResumeMatchesRouter());
  app.get('/resumes', ensureAuthenticated, (_req, res) => res.render('resumes'));
  app.get('/resumes/:id', ensureAuthenticated, (req, res) => res.render('resumeVersions', { resumeId: require('./utils/product').id(req.params.id) }));
  app.use('/api', require('./routes/resumes').createResumesRouter());
  app.use('/api', require('./routes/progressApi').createProgressApiRouter());
  app.use('/api', require('./routes/interviews').createInterviewsRouter());
  app.use('/api', require('./routes/questionBank').createQuestionBankRouter());
  app.use('/api', createMockRouter());
  app.use('/reports', createReportsRouter());
  app.use('/progress', createProgressRouter());
  app.use('/hr-round', createHrRouter());
  app.use('/technical-round', createTechnicalRouter());
  app.use('/coding-test', createCodingRouter());
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
