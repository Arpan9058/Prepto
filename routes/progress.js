const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { listReports, testTypes, mockSubTests } = require('../utils/reports');
function createProgressRouter() {
  const router = express.Router();
  router.get('/', ensureAuthenticated, asyncHandler(async (req, res) => {
    const reports = await listReports(req.app.locals.firebase.firestore(), req.user.uid);
    const progressData = Object.fromEntries(testTypes.map(t => [t, t === 'MockTest' ? Object.fromEntries(mockSubTests.map(s => [s, []])) : []]));
    for (const r of reports.reverse()) {
      const target = r.type === 'MockTest' ? progressData.MockTest[r.subTest] : progressData[r.type];
      target.push({ id: r.id, score: r.score, submittedAt: r.submittedAt });
    }
    res.render('progressDashboard', { progressData, testTypes, mockSubTests });
  }));
  return router;
}
module.exports = { createProgressRouter };
