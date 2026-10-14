const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { upload } = require('../ats');
const service = require('../services/resumes');
function createResumesRouter() {
  const router = express.Router(); router.use(ensureAuthenticated); const db = req => req.app.locals.firebase.firestore();
  router.get('/resumes', asyncHandler(async (req, res) => res.json(await service.list(db(req), req.user.uid, req.query))));
  router.post('/resumes', upload.single('resume'), asyncHandler(async (req, res) => { const value = await service.create(db(req), req.user.uid, req.body, req.file); res.status(value.replayed ? 200 : 201).json(value); }));
  router.get('/resumes/:id', asyncHandler(async (req, res) => res.json(await service.get(db(req), req.user.uid, req.params.id))));
  router.get('/resumes/:id/versions', asyncHandler(async (req, res) => res.json(await service.listVersions(db(req), req.user.uid, req.params.id, req.query))));
  router.post('/resumes/:id/versions', upload.single('resume'), asyncHandler(async (req, res) => { const value = await service.addVersion(db(req), req.user.uid, req.params.id, req.body, req.file); res.status(value.replayed ? 200 : 201).json(value); }));
  router.get('/resumes/:id/versions/:versionId', asyncHandler(async (req, res) => res.json(await service.getVersion(db(req), req.user.uid, req.params.id, req.params.versionId))));
  router.put('/resumes/:id/current', asyncHandler(async (req, res) => res.json(await service.setCurrent(db(req), req.user.uid, req.params.id, req.body))));
  router.get('/resumes/:id/versions/:versionId/pdf', asyncHandler(async (req, res) => {
    const html = await service.pdfHtml(db(req), req.user.uid, req.params.id, req.params.versionId);
    const buffer = await req.app.locals.pdf(html); res.attachment('resume-version.pdf').type('application/pdf').send(buffer);
  }));
  return router;
}
module.exports = { createResumesRouter };
