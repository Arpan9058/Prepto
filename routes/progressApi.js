const { schemas, validateBody } = require('../utils/validation');
const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const service = require('../services/progress');
function createProgressApiRouter() {
  const router = express.Router();
  router.use(ensureAuthenticated);
  const db = (req) => req.app.locals.firebase.firestore();
  router.get(
    '/progress/overview',
    asyncHandler(async (req, res) => res.json(await service.overview(db(req), req.user.uid))),
  );
  router.get(
    '/progress/attempts',
    asyncHandler(async (req, res) =>
      res.json(await service.history(db(req), req.user.uid, req.query)),
    ),
  );
  router.put(
    '/progress/goals',
    validateBody(schemas.goal),
    asyncHandler(async (req, res) =>
      res.json(await service.saveGoal(db(req), req.user.uid, req.body)),
    ),
  );
  router.delete(
    '/progress/goals/:id',
    validateBody(schemas.revision),
    asyncHandler(async (req, res) => {
      await service.removeGoal(db(req), req.user.uid, req.params.id, req.body.revision);
      res.json({ deleted: true });
    }),
  );
  return router;
}
module.exports = { createProgressApiRouter };
