const { httpError } = require('../middleware/errors');
const { attempts, answerReport } = require('../utils/reports');
const initialQuestion = 'Give me your introduction and your technical skills?';
async function analyzeText(req, res) {
  const { text } = req.body;
  if (typeof text !== 'string' || !text.trim()) throw httpError(400, 'Answer is required');
  let state = req.session.technicalInterview ? structuredClone(req.session.technicalInterview) : null;
  if (state?.completed) throw httpError(409, 'Interview already completed');
  if (!state) {
    const skills = await req.app.locals.gemini.generate(`Extract exactly three technical skills from this introduction as a JSON array of strings: ${text}`, { json: true });
    if (!Array.isArray(skills) || skills.length !== 3 || skills.some(s => typeof s !== 'string' || !s.trim() || s.length > 200)) throw new Error('Invalid extracted skills');
    state = req.session.technicalInterview = { skills, answers: [], skillScores: [0, 0, 0], currentSkillIndex: 0, question: `Tell me about ${skills[0]} (easy level)` };
    return res.json(responseState(state));
  }
  const analysis = await req.app.locals.gemini.generate(`Evaluate the technical interview answer. Return JSON with analysis, recommendation, totalScore (0-10), scores and followUpQuestion. Question: ${state.question}\nAnswer: ${text}`, { json: true });
  if (!Number.isFinite(analysis.totalScore) || analysis.totalScore < 0 || analysis.totalScore > 10) throw new Error('Invalid technical score');
  state.answers.push({ question: state.question, answer: text, analysis: String(analysis.analysis || ''), recommendation: String(analysis.recommendation || ''), totalScore: analysis.totalScore });
  state.skillScores[state.currentSkillIndex] += analysis.totalScore;
  const perSkill = state.answers.length % 6;
  if (perSkill === 0) {
    if (state.skillScores[state.currentSkillIndex] < 20 || state.currentSkillIndex === 2) state.completed = true;
    else state.currentSkillIndex++;
  }
  if (state.completed) {
    const totalScore = state.skillScores.reduce((sum, n) => sum + n, 0);
    const fullReport = answerReport('Technical Interview Report', state.answers);
    await attempts(req.app.locals.firebase.firestore(), req.user.uid, 'TechnicalInterview').add({ totalScore, avgScore: totalScore / state.answers.length, extractedSkills: state.skills, skillScores: state.skillScores, fullReport, submittedAt: new Date() });
    req.session.technicalInterview = state;
    return res.json({ ...responseState(state), fullReport, interviewComplete: true });
  }
  state.question = perSkill === 0 ? `Tell me about ${state.skills[state.currentSkillIndex]} (easy level)` : String(analysis.followUpQuestion || `Explain more about ${state.skills[state.currentSkillIndex]}`);
  req.session.technicalInterview = state;
  res.json({ ...responseState(state), analysis: { ...analysis, followUpQuestion: state.question } });
}
function responseState(state) {
  const perSkill = state.answers.length % 6;
  return { analysis: { followUpQuestion: state.question }, currentSkillIndex: state.currentSkillIndex, currentDifficulty: perSkill < 2 ? 'easy' : perSkill < 4 ? 'medium' : 'hard', questionsPerSkill: perSkill, totalQuestions: state.answers.length + 1, skillScores: state.skillScores, extractedSkills: state.skills };
}
module.exports = { analyzeText, initialQuestion };
