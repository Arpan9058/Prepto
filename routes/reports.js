const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { listReports, attempts, validReport, safeHtml, formatDate } = require('../utils/reports');
function createReportsRouter() {
  const router = express.Router();
  router.use(ensureAuthenticated);
  router.get('/', asyncHandler(async (req, res) => res.render('reports', { reports: await listReports(req.app.locals.firebase.firestore(), req.user.uid) })));
  async function load(req) {
    const { type, sub } = req.query;
    if (!validReport(type, sub) || !/^[\w-]{1,128}$/.test(req.params.id)) throw httpError(400, 'Invalid report');
    const doc = await attempts(req.app.locals.firebase.firestore(), req.user.uid, type, sub).doc(req.params.id).get();
    if (!doc.exists) throw httpError(404, 'Report not found');
    const d = doc.data();
    return { ...d, fullReport: safeHtml(d.fullReport || d.reportText || '') };
  }
  router.get('/view/:id', asyncHandler(async (req, res) => {
    const data = await load(req);
    res.render('testReport', { type: req.query.type, sub: req.query.sub, submittedAt: formatDate(data.submittedAt), score: req.query.type === 'CodingPractice' ? `AI estimate ${data.aiScore}% (execution disabled)` : data.score ?? data.totalScore ?? 0, fullReport: data.fullReport });
  }));
  router.get('/download/:id', asyncHandler(async (req, res) => {
    const data = await load(req);
    res.attachment(`report-${req.params.id}.json`).json(data);
  }));
  return router;
}
module.exports = { createReportsRouter };
