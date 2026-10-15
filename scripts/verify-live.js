const { boundPort } = require('../utils/boundPort');
if (require.main === module) require('dotenv').config({ quiet: true });
const { randomUUID, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const pino = require('pino');
const bank = require('../services/questionBank');

// Continue cleanup after an individual failure. Only references registered by this run
// are accepted; no project-wide enumeration/deletion or existing-user deletion occurs.
async function cleanupCreated(actions) {
  let failed = 0;
  for (const action of [...actions].reverse()) {
    try {
      await action();
    } catch {
      failed++;
    }
  }
  return failed === 0;
}
async function passwordLogin(apiKey, email, password, fetcher = fetch) {
  const r = await fetcher(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!r.ok) throw new Error('Isolated Firebase password sign-in failed');
  const data = await r.json();
  if (typeof data.idToken !== 'string') throw new Error('Missing Firebase ID token');
  return data.idToken;
}
async function verify({ enabled = false, env = process.env } = {}) {
  const report = { mode: 'live', checks: [], cleanup: 'not-needed' };
  const blocked = (reason) => {
    report.checks.push({ check: 'Live prerequisites', status: 'unrun', reason });
    return report;
  };
  if (!enabled) return blocked('Opt in explicitly: npm run verify:live -- --run');
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)
    return blocked('Disable emulator bindings for a live run');
  if (!env.LIVE_FIREBASE_PROJECT_ID || !env.GEMINI_API_KEY)
    return blocked('Existing GEMINI_API_KEY and LIVE_FIREBASE_PROJECT_ID bindings are required');
  let fb, config;
  try {
    config = env.FIREBASE_WEB_CONFIG_JSON
      ? JSON.parse(env.FIREBASE_WEB_CONFIG_JSON)
      : require('../config/firebase-web.json');
    fb = require('../adapters/firebase').getFirebase(env);
    const app = require('firebase-admin/app').getApp();
    const credential = app.options.credential;
    const actual =
      app.options.projectId ||
      ('projectId' in credential && typeof credential.projectId === 'string'
        ? credential.projectId
        : null) ||
      ('getProjectId' in credential && typeof credential.getProjectId === 'function'
        ? await credential.getProjectId()
        : null);
    if (actual !== env.LIVE_FIREBASE_PROJECT_ID || config.projectId !== actual || !config.apiKey)
      return blocked('Admin and public-web project IDs must match the authorized project pin');
    await credential.getAccessToken();
  } catch {
    return blocked('Existing Firebase service-account/ADC or public-web binding is unavailable');
  }
  const run = `prepto-live-${randomUUID()}`,
    owner = `${run}-owner`,
    other = `${run}-other`;
  report.runId = run;
  const cleanup = [],
    db = fb.firestore();
  let server;
  try {
    const email = `${run}@example.test`,
      password = randomBytes(32).toString('base64url');
    for (const uid of [owner, other]) {
      await fb.auth().createUser({ uid, ...(uid === owner ? { email, password } : {}) });
      cleanup.push(() => fb.auth().deleteUser(uid));
      cleanup.push(() => db.recursiveDelete(db.collection('users').doc(uid)));
    }
    const token = await passwordLogin(config.apiKey, email, password);
    const { createApp } = require('../app');
    const app = createApp({
      env: { ...env, NODE_ENV: 'development', SESSION_SECRET: randomBytes(48).toString('hex') },
      firebase: fb,
      sessionStore: new (require('express-session').MemoryStore)(),
      logger: pino({ level: 'silent' }),
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${boundPort(server)}`;
    const login = await fetch(base + '/api/set-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.ok(cookies.some((c) => /HttpOnly/i.test(c)));
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    const api = async (path, body, method = 'POST') => {
      const r = await fetch(base + path, {
        method: body === undefined ? 'GET' : method,
        headers: { cookie, Origin: base, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error('Live HTTP workflow failed');
      return r.json();
    };
    assert.equal((await api('/api/session')).uid, owner);
    assert.equal((await fetch(base + '/api/session')).status, 401);
    report.checks.push({
      check: 'Real isolated password login, HttpOnly cookie exchange and anonymous guard',
      status: 'passed',
    });
    const q = await bank.saveQuestion(db, owner, {
      title: run,
      prompt: 'Explain event-loop scheduling in Node.js with one example.',
      category: 'technical',
      difficulty: 'easy',
      type: 'openEnded',
      skills: ['Node.js'],
      explanation: 'Explain asynchronous callbacks, scheduling, and a tradeoff.',
    });
    cleanup.push(async () => {
      const events = await db.collection('questionEvents').where('questionId', '==', q.id).get();
      for (const doc of events.docs) await doc.ref.delete();
    });
    cleanup.push(() => db.recursiveDelete(db.collection('questionBank').doc(q.id)));
    let session = await api('/api/interviews', { title: run, questionIds: [q.id] });
    cleanup.push(() => db.recursiveDelete(db.collection('interviewSessions').doc(session.id)));
    await assert.rejects(() => require('../services/interviews').get(db, other, session.id), {
      status: 404,
    });
    session = await api(`/api/interviews/${session.id}/pause`, { version: session.version });
    session = await api(`/api/interviews/${session.id}/resume`, { version: session.version });
    session = await api(`/api/interviews/${session.id}/answers`, {
      questionId: q.id,
      text: 'The event loop schedules callbacks after asynchronous operations. CPU-heavy callbacks can delay other requests, so expensive work should move to a worker.',
      requestId: randomUUID(),
      version: session.version,
    });
    session = await api(`/api/interviews/${session.id}/complete`, { version: session.version });
    assert.equal((await api(`/api/interviews/${session.id}/review`)).status, 'completed');
    const reports = await api('/api/reports');
    assert.ok(reports.items.some((r) => r.id === session.id));
    const saved = await api(`/api/reports/${session.id}?type=InterviewPractice`);
    assert.ok(saved.fullReport.length);
    assert.ok((await api('/api/progress/overview')).summary.attempts >= 1);
    report.checks.push({
      check: 'HTTP interview pause/resume, real Gemini feedback, saved report and progress',
      status: 'passed',
    });
    const original = await api('/api/resumes', {
      title: run,
      text: 'Synthetic test candidate: Node.js API and SQL project.',
      requestId: randomUUID(),
    });
    const updated = await api(`/api/resumes/${original.resume.id}/versions`, {
      text: 'Synthetic test candidate: Node.js API, SQL queries and tests.',
      expectedRevision: 1,
      requestId: randomUUID(),
    });
    const pdf = await fetch(
      base + `/api/resumes/${original.resume.id}/versions/${updated.version.id}/pdf`,
      { headers: { cookie }, signal: AbortSignal.timeout(60000) },
    );
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    const extracted = await require('../ats').extractTextFromFile({
      originalname: 'synthetic-live.pdf',
      buffer: bytes,
    });
    assert.match(extracted, /Synthetic/);
    const form = new FormData();
    form.set('title', run + '-pdf-upload');
    form.set('requestId', randomUUID());
    form.set('resume', new Blob([bytes], { type: 'application/pdf' }), 'synthetic-live.pdf');
    const uploaded = await fetch(base + '/api/resumes', {
      method: 'POST',
      headers: { cookie, Origin: base },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(uploaded.status, 201);
    const matched = await api('/api/resume-matches', {
      resumeId: original.resume.id,
      resumeVersionId: updated.version.id,
      jobTitle: 'Synthetic Node.js role',
      jobDescription: 'Build Node.js APIs with SQL and tests.',
      requestId: randomUUID(),
    });
    assert.equal(matched.match.status, 'completed');
    await assert.rejects(() => require('../services/resumes').get(db, other, original.resume.id), {
      status: 404,
    });
    report.checks.push({
      check:
        'HTTP private versions, real Chromium PDF/download/extraction/upload and real Gemini matching',
      status: 'passed',
    });
  } catch {
    report.checks.push({
      check: 'Live workflow',
      status: 'failed',
      reason: 'Operation failed; provider/token/credential details deliberately withheld',
    });
  } finally {
    if (server)
      await new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      });
    report.cleanup = (await cleanupCreated(cleanup)) ? 'passed' : 'failed';
    if (report.cleanup === 'failed')
      report.checks.push({
        check: 'Cleanup',
        status: 'failed',
        reason: 'Inspect only the reported run ID; isolated resources need operator cleanup',
      });
  }
  return report;
}
if (require.main === module)
  verify({ enabled: process.argv.includes('--run') })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.checks.some((c) => c.status === 'failed')
        ? 1
        : report.checks.some((c) => c.status === 'unrun')
          ? 2
          : 0;
    })
    .catch(() => {
      console.error('Live validation failed; no private provider details logged');
      process.exitCode = 1;
    });
module.exports = { verify, passwordLogin, cleanupCreated };
