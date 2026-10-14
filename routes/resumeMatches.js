const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const service = require('../services/resumeMatches');
function createResumeMatchesRouter() {
  const router = express.Router(); router.use(ensureAuthenticated); const db = req => req.app.locals.firebase.firestore();
  router.post('/resume-matches', asyncHandler(async (req, res) => { const result = await service.create(db(req), req.app.locals.gemini, req.user.uid, req.body); res.status(result.replayed ? 200 : 201).json(result); }));
  router.get('/resume-matches', asyncHandler(async (req, res) => res.json(await service.list(db(req), req.user.uid, req.query))));
  router.get('/resume-matches/:id', asyncHandler(async (req, res) => res.json(await service.get(db(req), req.user.uid, req.params.id))));
  router.post('/resume-matches/compare', asyncHandler(async (req, res) => res.json(await service.compare(db(req), req.user.uid, req.body.firstId, req.body.secondId))));
  return router;
}
module.exports = { createResumeMatchesRouter };
