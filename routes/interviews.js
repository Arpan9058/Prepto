const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const service = require('../services/interviews');
function createInterviewsRouter() {
  const router = express.Router(); router.use(ensureAuthenticated);
  const db = req => req.app.locals.firebase.firestore();
  router.get('/interviews', asyncHandler(async (req, res) => res.json(await service.list(db(req), req.user.uid, req.query))));
  router.post('/interviews', asyncHandler(async (req, res) => res.status(201).json(await service.start(db(req), req.user.uid, req.body))));
  router.get('/interviews/:id', asyncHandler(async (req, res) => res.json(await service.get(db(req), req.user.uid, req.params.id))));
  for (const [action, target] of [['pause', 'paused'], ['resume', 'active']]) router.post(`/interviews/:id/${action}`, asyncHandler(async (req, res) => res.json(await service.transition(db(req), req.user.uid, req.params.id, target, req.body.version))));
  router.post('/interviews/:id/answers', asyncHandler(async (req, res) => res.json(await service.submitAnswer(db(req), req.app.locals.gemini, req.user.uid, req.params.id, req.body))));
  router.post('/interviews/:id/complete', asyncHandler(async (req, res) => res.json(await service.complete(db(req), req.user.uid, req.params.id, req.body.version))));
  router.get('/interviews/:id/review', asyncHandler(async (req, res) => res.json(await service.review(db(req), req.user.uid, req.params.id))));
  return router;
}
module.exports = { createInterviewsRouter };
