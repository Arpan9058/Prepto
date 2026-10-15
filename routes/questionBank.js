const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { asyncHandler } = require('../middleware/errors');
const { publicQuestion } = require('../utils/product');
const service = require('../services/questionBank');
function createQuestionBankRouter() {
  const router = express.Router();
  router.use(ensureAuthenticated);
  const db = (req) => req.app.locals.firebase.firestore();
  router.get(
    '/questions',
    asyncHandler(async (req, res) =>
      res.json(
        await service.listQuestions(db(req), req.user.uid, req.query, req.user.admin === true),
      ),
    ),
  );
  router.get(
    '/questions/:id',
    asyncHandler(async (req, res) => {
      const q = await service.question(db(req), req.params.id, req.user.admin === true);
      res.json(req.user.admin === true ? q : publicQuestion(q));
    }),
  );
  router.put(
    '/questions/:id/bookmark',
    asyncHandler(async (req, res) => {
      await service.setBookmark(db(req), req.user.uid, req.params.id, true);
      res.json({ saved: true });
    }),
  );
  router.delete(
    '/questions/:id/bookmark',
    asyncHandler(async (req, res) => {
      await service.setBookmark(db(req), req.user.uid, req.params.id, false);
      res.json({ saved: false });
    }),
  );
  router.get(
    '/bookmarks',
    asyncHandler(async (req, res) =>
      res.json(await service.listBookmarks(db(req), req.user.uid, req.query)),
    ),
  );
  router.post(
    '/admin/questions',
    requireAdmin,
    asyncHandler(async (req, res) =>
      res.status(201).json(await service.saveQuestion(db(req), req.user.uid, req.body)),
    ),
  );
  router.put(
    '/admin/questions/:id',
    requireAdmin,
    asyncHandler(async (req, res) =>
      res.json(await service.saveQuestion(db(req), req.user.uid, req.body, req.params.id)),
    ),
  );
  router.post(
    '/admin/questions/:id/archive',
    requireAdmin,
    asyncHandler(async (req, res) => {
      await service.archiveQuestion(db(req), req.user.uid, req.params.id, req.body.revision);
      res.json({ archived: true });
    }),
  );
  return router;
}
module.exports = { createQuestionBankRouter };
