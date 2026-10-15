const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { listReports, attempts, validReport, safeHtml, formatDate } = require('../utils/reports');
function createWorkspaceRouter({ env }) {
  const r = express.Router();
  r.get('/runtime', (req, res) => {
    let firebase = null;
    if (!req.app.locals.demoMode) {
      try {
        const raw = env.FIREBASE_WEB_CONFIG_JSON ? JSON.parse(env.FIREBASE_WEB_CONFIG_JSON) : require('../config/firebase-web.json');
        const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
        if (Object.keys(raw).every(k => keys.includes(k)) && ['apiKey', 'authDomain', 'projectId', 'appId'].every(k => typeof raw[k] === 'string' && raw[k])) firebase = Object.fromEntries(keys.filter(k => typeof raw[k] === 'string').map(k => [k, raw[k]]));
      } catch { /* Invalid client configuration is never reflected into the response. */ }
    }
    res.set('Cache-Control', 'no-store').json({ demo: req.app.locals.demoMode === true, firebase });
  });
  r.use(ensureAuthenticated); const db = req => req.app.locals.firebase.firestore();
  r.get('/session', (req, res) => res.set('Cache-Control', 'no-store').json({ uid: req.user.uid, admin: req.user.admin === true, demo: req.app.locals.demoMode === true }));
  r.get('/profile', asyncHandler(async (req, res) => { const d = await db(req).collection('users').doc(req.user.uid).get(); const raw = d.exists ? d.data() : {}; res.set('Cache-Control', 'no-store').json({ fullName: raw.fullName || '', mobile: raw.mobile || '' }); }));
  r.put('/profile', asyncHandler(async (req, res) => {
    const { fullName, mobile = '' } = req.body;
    if (typeof fullName !== 'string' || !fullName.trim() || fullName.length > 200 || typeof mobile !== 'string' || mobile.length > 40) throw httpError(400, 'Provide a name up to 200 characters and a phone up to 40 characters');
    const ref = db(req).collection('users').doc(req.user.uid);
    await db(req).runTransaction(async tx => { const old = await tx.get(ref); tx.set(ref, { ...(old.exists ? old.data() : {}), fullName: fullName.trim(), mobile, updatedAt: new Date() }); });
    res.json({ saved: true });
  }));
  r.get('/reports', asyncHandler(async (req, res) => {
    const rows = await listReports(db(req), req.user.uid);
    res.json({ items: rows.map(({ raw, ...row }) => ({ ...row, title: raw.title || row.type })) });
  }));
  r.get('/reports/:id', asyncHandler(async (req, res) => {
    const { type, sub } = req.query;
    if (!validReport(type, sub) || !/^[\w-]{1,128}$/.test(req.params.id)) throw httpError(400, 'Invalid report');
    const d = await attempts(db(req), req.user.uid, type, sub).doc(req.params.id).get(); if (!d.exists) throw httpError(404, 'Report not found');
    const raw = d.data(); res.json({ id: d.id, type, title: raw.title || type, score: type === 'CodingPractice' ? `AI estimate ${raw.aiScore}% (not executed)` : raw.score ?? raw.totalScore ?? 0, submittedAt: formatDate(raw.submittedAt), fullReport: safeHtml(raw.fullReport || raw.reportText || '') });
  }));
  return r;
}
module.exports = { createWorkspaceRouter };
