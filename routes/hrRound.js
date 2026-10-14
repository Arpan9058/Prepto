const express = require('express');
const questions = require('../HRQuestions.json');
const { ensureAuthenticated } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errors');
const { answerReport, attempts } = require('../utils/reports');
function createHrRouter() {
  const router = express.Router();
  router.use(ensureAuthenticated);
  router.get('/', (req, res) => { req.session.hrInterview = { answers: [] }; res.render('hrRound', { question: questions }); });
  router.get('/initial-question', (req, res) => { req.session.hrInterview = { answers: [] }; res.json({ question: questions[0] }); });
  router.post('/analyze-text', asyncHandler(async (req, res) => {
    const state = req.session.hrInterview ? structuredClone(req.session.hrInterview) : null;
    if (!state) throw httpError(409, 'Start an HR interview first');
    if (state.completed) throw httpError(409, 'Interview already completed');
    if (typeof req.body.text !== 'string' || !req.body.text.trim()) throw httpError(400, 'Answer is required');
    const index = state.answers.length;
    if (req.body.questionCounter !== undefined && Number(req.body.questionCounter) !== index) throw httpError(409, 'Question is out of sequence');
    const question = questions[index];
    const analysis = await req.app.locals.gemini.generate(`Evaluate this HR interview answer. Return JSON analysis, recommendation and score (0-5). Question: ${question}\nAnswer: ${req.body.text}`, { json: true });
    if (!Number.isFinite(analysis.score) || analysis.score < 0 || analysis.score > 5) throw new Error('Invalid HR score');
    state.answers.push({ question, answer: req.body.text, analysis: String(analysis.analysis || ''), recommendation: String(analysis.recommendation || ''), score: analysis.score });
    const completed = state.answers.length === questions.length;
    if (completed) {
      const totalScore = state.answers.reduce((sum, a) => sum + a.score, 0);
      await attempts(req.app.locals.firebase.firestore(), req.user.uid, 'HRInterview').add({ totalScore, avgScore: totalScore / state.answers.length, fullReport: answerReport('HR Interview Report', state.answers), submittedAt: new Date() });
      state.completed = true;
    }
    req.session.hrInterview = state;
    res.json({ analysis, interviewComplete: completed, followUpQuestion: { question: completed ? 'Thank you, that concludes this question.' : questions[state.answers.length] } });
  }));
  return router;
}
module.exports = { createHrRouter };
