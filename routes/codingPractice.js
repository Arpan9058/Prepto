const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const s = require('../services/codingPractice');
function createCodingPracticeRouter() {
  const r = express.Router();
  r.use(ensureAuthenticated);
  const db = (req) => req.app.locals.firebase.firestore();
  r.get(
    '/coding/problems',
    asyncHandler(async (req, res) => res.json(s.library(req.query))),
  );
  r.get(
    '/coding/problems/:id',
    asyncHandler(async (req, res) => res.json(s.problem(req.params.id))),
  );
  r.get(
    '/coding/drafts/:id',
    asyncHandler(async (req, res) =>
      res.json(await s.draft(db(req), req.user.uid, req.params.id, req.query.language)),
    ),
  );
  r.put(
    '/coding/drafts/:id',
    asyncHandler(async (req, res) =>
      res.json(await s.saveDraft(db(req), req.user.uid, { ...req.body, problemId: req.params.id })),
    ),
  );
  r.post(
    '/coding/submissions',
    asyncHandler(async (req, res) => {
      const value = await s.submit(db(req), req.app.locals.gemini, req.user.uid, req.body);
      res.status(value.replayed ? 200 : 201).json(value);
    }),
  );
  r.get(
    '/coding/submissions',
    asyncHandler(async (req, res) =>
      res.json(await s.submissions(db(req), req.user.uid, req.query)),
    ),
  );
  r.get(
    '/coding/submissions/:id',
    asyncHandler(async (req, res) => res.json(await s.get(db(req), req.user.uid, req.params.id))),
  );
  r.post('/coding/execute', (_req, res) =>
    res.status(501).json({ error: 'Untrusted execution is disabled', execution: s.execution }),
  );
  return r;
}
module.exports = { createCodingPracticeRouter };
