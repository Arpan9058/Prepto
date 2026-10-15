const { schemas, validateBody } = require('../utils/validation');
const express = require('express');
const { randomUUID, randomInt } = require('node:crypto');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { mockSubTests, attempts, answerReport } = require('../utils/reports');
function createMockRouter() {
  const router = express.Router();
  router.use(ensureAuthenticated);
  router.get('/mockTest', (_req, res) => res.render('mockInterview'));
  router.post(
    '/sessions',
    validateBody(schemas.mockStart),
    asyncHandler(async (req, res) => {
      const { category } = req.body;
      if (!mockSubTests.includes(category)) throw httpError(400, 'Invalid category');
      const db = req.app.locals.firebase.firestore();
      const snapshot = await db.collection('questions').doc(category).collection('data').get();
      const questions = snapshot.docs.map((doc) => ({ ...doc.data(), _id: doc.id }));
      if (!questions.length) throw httpError(404, 'No questions found');
      for (let i = questions.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
      const selected = questions.slice(0, 5);
      if (selected.some((q) => !Array.isArray(q.options) || !q.options.includes(q.answer)))
        throw new Error('Invalid question data');
      const sessionId = randomUUID();
      await db.collection('sessions').doc(sessionId).set({
        sessionId,
        ownerUid: req.user.uid,
        category,
        questions: selected,
        createdAt: new Date(),
        completed: false,
      });
      res.json({
        success: true,
        sessionId,
        questions: selected.map((q) => ({ _id: q._id, question: q.question, options: q.options })),
      });
    }),
  );
  router.post(
    '/sessions/submit',
    validateBody(schemas.mockSubmit),
    asyncHandler(async (req, res) => {
      const { sessionId, answers } = req.body;
      if (
        typeof sessionId !== 'string' ||
        !/^[\w-]{1,100}$/.test(sessionId) ||
        !answers ||
        typeof answers !== 'object' ||
        Array.isArray(answers)
      )
        throw httpError(400, 'sessionId and answers required');
      const db = req.app.locals.firebase.firestore();
      const ref = db.collection('sessions').doc(sessionId);
      const result = await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists) throw httpError(404, 'Session not found');
        const data = doc.data();
        if (data.ownerUid !== req.user.uid) throw httpError(403, 'Session belongs to another user');
        if (data.completed) throw httpError(409, 'Session already submitted');
        if (!mockSubTests.includes(data.category)) throw new Error('Invalid saved category');
        if (Object.keys(answers).some((id) => !data.questions.some((q) => q._id === id)))
          throw httpError(400, 'Unknown question');
        const detailed = data.questions.map((q) => {
          const selected = answers[q._id] ?? null;
          if (selected !== null && !q.options.includes(selected))
            throw httpError(400, 'Invalid answer');
          return {
            questionId: q._id,
            question: q.question,
            selectedAnswer: selected,
            correctAnswer: q.answer,
            correct: selected === q.answer,
          };
        });
        const score = detailed.filter((a) => a.correct).length;
        tx.set(attempts(db, req.user.uid, 'MockTest', data.category).doc(sessionId), {
          score,
          maxScore: detailed.length,
          normalizedScore: (score / detailed.length) * 100,
          skillResults: [
            {
              skill: data.category,
              score: (score / detailed.length) * 100,
              nextStep: 'Review incorrect answers and practice a similar question.',
            },
          ],
          total: detailed.length,
          answers: detailed,
          fullReport: answerReport('Mock Test Report', detailed),
          submittedAt: new Date(),
        });
        tx.update(ref, { completed: true });
        return {
          success: true,
          score,
          total: detailed.length,
          message: 'Mock test submitted successfully!',
        };
      });
      res.json(result);
    }),
  );
  return router;
}
module.exports = { createMockRouter };
