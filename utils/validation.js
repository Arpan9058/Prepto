const { z } = require('zod');
const { httpError } = require('../middleware/errors');
const identifier = z.string().regex(/^[\w-]{1,128}$/);
const revision = z.number().int().nonnegative();
const schemas = {
  mockStart: z.object({ category: z.string().min(1).max(60) }),
  mockSubmit: z.object({
    sessionId: identifier,
    answers: z.record(identifier, z.union([z.string().max(4000), z.null()])),
  }),
  codingStart: z.object({ language: z.enum(['Java', 'C', 'C++', 'Python']) }),
  codingAnswer: z.object({
    code: z.string().max(100000),
    earlySubmit: z.enum(['true', 'false']).optional(),
  }),
  goal: z.object({
    skill: z.string().trim().min(1).max(60),
    targetScore: z.number().int().min(1).max(100),
    weeklySessions: z.number().int().min(1).max(14),
    revision: revision.optional(),
  }),
  revision: z.object({ revision }),
  interviewStart: z.object({
    title: z.string().max(100).optional(),
    questionIds: z.array(identifier).min(1).max(10),
  }),
  transition: z.object({ version: revision }),
};
/** @param {import('zod').ZodType} schema */
function validateBody(schema) {
  /** @type {import('express').RequestHandler} */
  const handler = (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(httpError(400, 'Invalid request fields'));
    req.body = result.data;
    next();
  };
  return handler;
}
/** Parsed JSON/form bodies must be objects; multipart fields are validated after upload. */
const objectBody = z.looseObject({});
/** @type {import('express').RequestHandler} */
function validateObjectBody(req, _res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const result = objectBody.safeParse(req.body ?? {});
  if (!result.success) return next(httpError(400, 'Request body must be an object'));
  req.body = result.data;
  next();
}
module.exports = { schemas, validateBody, validateObjectBody };
