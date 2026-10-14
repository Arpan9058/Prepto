require('dotenv').config({ quiet: true });
const { randomUUID, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { createGemini } = require('../adapters/gemini');
const bank = require('../services/questionBank');
const sessions = require('../services/interviews');
const progress = require('../services/progress');
async function verify() {
  const report = { mode: 'live', checks: [], cleanup: 'not-needed' };
  if (process.env.FIRESTORE_EMULATOR_HOST) { report.checks.push({ check: 'Live backend', status: 'blocked', reason: 'Emulator binding is active' }); return report; }
  if (!process.env.GEMINI_API_KEY) report.checks.push({ check: 'Gemini binding', status: 'blocked', reason: 'GEMINI_API_KEY is missing' });
  let fb;
  try { fb = require('../adapters/firebase').getFirebase(); await require('firebase-admin/app').getApp().options.credential.getAccessToken(); }
  catch { report.checks.push({ check: 'Firebase binding', status: 'blocked', reason: 'Existing service-account/ADC binding could not authenticate' }); }
  const expected = process.env.LIVE_FIREBASE_PROJECT_ID;
  if (!expected) report.checks.push({ check: 'Project safety pin', status: 'blocked', reason: 'Set LIVE_FIREBASE_PROJECT_ID to the authorized project before creating isolated data' });
  if (report.checks.some(c => c.status === 'blocked')) return report;
  const db = fb.firestore();
  const credential = require('firebase-admin/app').getApp().options.credential;
  const actual = require('firebase-admin/app').getApp().options.projectId || credential.projectId || (credential.getProjectId ? await credential.getProjectId() : null);
  if (actual !== expected) { report.checks.push({ check: 'Project safety pin', status: 'blocked', reason: 'Credential project does not match the authorized project pin' }); return report; }
  const run = `prepto-live-${randomUUID()}`, owner = `${run}-owner`, other = `${run}-other`;
  const roots = []; const questionIds = []; const userIds = [];
  let app, server;
  try {
    for (const uid of [owner, other]) { await fb.auth().createUser({ uid }); userIds.push(uid); roots.push(db.collection('users').doc(uid)); }
    await fb.auth().setCustomUserClaims(owner, { admin: true });
    assert.equal((await fb.auth().getUser(owner)).customClaims.admin, true);
    report.checks.push({ check: 'Firebase Admin Auth isolated user/claim operations', status: 'passed' });
    const q = await bank.saveQuestion(db, owner, { title: run, prompt: 'Explain event-loop scheduling in Node.js with one example.', category: 'technical', difficulty: 'easy', type: 'openEnded', skills: ['Node.js'], explanation: 'Explain asynchronous callbacks, scheduling, and a tradeoff.' });
    questionIds.push(q.id); roots.push(db.collection('questionBank').doc(q.id));
    const search = await bank.listQuestions(db, owner, { q: 'node', category: 'technical', difficulty: 'easy', pageSize: 1 }, false);
    assert.ok(Array.isArray(search.items)); // This exercises production composite indexes.
    await bank.setBookmark(db, owner, q.id, true);
    assert.equal((await bank.listBookmarks(db, other, {})).items.some(x => x.id === q.id), false);
    let session = await sessions.start(db, owner, { title: run, questionIds: [q.id] }); roots.push(db.collection('interviewSessions').doc(session.id));
    await assert.rejects(() => sessions.get(db, other, session.id), { status: 404 });
    session = await sessions.transition(db, owner, session.id, 'paused', session.version);
    session = await sessions.transition(db, owner, session.id, 'active', session.version);
    session = await sessions.submitAnswer(db, createGemini(), owner, session.id, { questionId: q.id, text: 'The event loop schedules callbacks after asynchronous operations, allowing the process to serve other requests. A CPU-heavy callback can delay other work.', requestId: randomUUID(), version: session.version });
    session = await sessions.complete(db, owner, session.id, session.version);
    assert.equal((await sessions.review(db, owner, session.id)).status, 'completed');
    await progress.saveGoal(db, owner, { skill: 'Node.js', targetScore: 80, weeklySessions: 2 });
    assert.ok((await progress.overview(db, owner)).summary.attempts >= 1);
    report.checks.push({ check: 'Live question bank, bookmarks, persistent interviews, Gemini feedback, review and progress', status: 'passed' });
    const { createApp } = require('../app');
    app = createApp({ env: { ...process.env, NODE_ENV: 'development', SESSION_SECRET: randomBytes(48).toString('hex') }, firebase: fb });
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/questions`);
    assert.equal(response.status, 401);
    report.checks.push({ check: 'Live-configured server rejects unauthenticated API access', status: 'passed' });
  } catch { report.checks.push({ check: 'Live workflow verification', status: 'failed', reason: 'Operation failed; provider response details are intentionally not logged' }); }
  finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    report.cleanup = 'passed';
    try {
      for (const ref of roots) await db.recursiveDelete(ref);
      for (const questionId of questionIds) { const events = await db.collection('questionEvents').where('questionId', '==', questionId).get(); for (const doc of events.docs) await doc.ref.delete(); }
      for (const uid of userIds) await fb.auth().deleteUser(uid);
    } catch { report.cleanup = 'failed'; report.checks.push({ check: 'Cleanup', status: 'failed', reason: 'Isolated data cleanup needs operator follow-up' }); }
  }
  return report;
}
if (require.main === module) verify().then(report => { console.log(JSON.stringify(report, null, 2)); process.exitCode = report.checks.some(c => c.status === 'failed') ? 1 : report.checks.some(c => c.status === 'blocked') ? 2 : 0; }).catch(() => { console.error('Live verification failed before setup; no credential/provider details logged'); process.exitCode = 1; });
module.exports = { verify };
