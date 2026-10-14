const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { analyzeText, initialQuestion } = require('../controller/interviewController');
function createTechnicalRouter() {
  const router = express.Router();
  router.use(ensureAuthenticated);
  router.get(['/', /^\/technical/ ], (req, res) => { delete req.session.technicalInterview; res.render('TechnicalInterview', { question: initialQuestion }); });
  router.post('/analyze-text', asyncHandler(analyzeText));
  return router;
}
module.exports = { createTechnicalRouter };
