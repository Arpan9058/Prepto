const { createHash } = require('node:crypto');
const { httpError } = require('../middleware/errors');
const { id, text, pageSize, iso } = require('../utils/product');
const { listReports, testTypes } = require('../utils/reports');
const round = n => Math.round(n * 10) / 10;
const validScore = n => Number.isFinite(n) && n >= 0 && n <= 100;
const goalRefs = (db, uid) => db.collection('users').doc(uid).collection('studyGoals');
function normalize(r) {
  const raw = r.raw;
  const points = Number.isFinite(raw.score ?? raw.totalScore) ? raw.score ?? raw.totalScore : null;
  let score = null;
  if (r.type === 'CodingPractice') score = null;
  else if (validScore(raw.normalizedScore)) score = raw.normalizedScore;
  else if (Number.isFinite(raw.maxScore) && raw.maxScore > 0 && points !== null) score = points / raw.maxScore * 100;
  else if (r.type === 'MockTest' && Number.isFinite(raw.total) && raw.total > 0 && points !== null) score = points / raw.total * 100;
  else if (r.type === 'HRInterview' && Number.isFinite(raw.avgScore)) score = raw.avgScore / 5 * 100;
  else if (r.type === 'TechnicalInterview' && Number.isFinite(raw.avgScore)) score = raw.avgScore / 10 * 100;
  else if (r.type === 'CodingTest' && Number.isFinite(raw.avgScore)) score = raw.avgScore;
  if (!validScore(score)) score = null;
  const bySkill = new Map();
  const results = r.type === 'CodingPractice' ? [] : Array.isArray(raw.skillResults) ? raw.skillResults : r.type === 'InterviewPractice' && Array.isArray(raw.answers) ? raw.answers.flatMap(a => (a.skills || []).map(skill => ({ skill, score: a.score, nextStep: a.nextStep }))) : [];
  for (const result of results) {
    if (!result || typeof result.skill !== 'string' || !result.skill.trim() || result.skill.length > 60 || !validScore(result.score)) continue;
    const key = result.skill.trim().toLowerCase();
    if (!bySkill.has(key)) bySkill.set(key, { skill: result.skill.trim(), scores: [], nextStep: '' });
    const entry = bySkill.get(key); entry.scores.push(result.score);
    if (typeof result.nextStep === 'string') entry.nextStep = result.nextStep.slice(0, 4000);
  }
  const skills = [...bySkill.values()].map(s => ({ skill: s.skill, score: round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length), nextStep: s.nextStep }));
  const key = Buffer.from(`${r.type}|${r.subTest || ''}|${r.id}`).toString('base64url');
  return { aiScore: r.type === 'CodingPractice' && validScore(raw.aiScore) ? raw.aiScore : null, aiSkills: r.type === 'CodingPractice' && Array.isArray(raw.skills) ? raw.skills : [], key, id: r.id, type: r.type, category: r.subTest, title: typeof raw.title === 'string' ? raw.title.slice(0, 100) : r.type, submittedAt: r.submittedAt === 'N/A' ? null : r.submittedAt, points, score: score === null ? null : round(score), skills, reportUrl: `/reports/view/${encodeURIComponent(r.id)}?type=${r.type}${r.subTest ? '&sub=' + encodeURIComponent(r.subTest) : ''}`, sessionId: r.type === 'InterviewPractice' ? r.id : null };
}
function summarize(items, now = new Date()) {
  const ordered = [...items].sort((a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0) || a.key.localeCompare(b.key));
  const graded = ordered.filter(r => r.score !== null);
  const cutoff = now.getTime() - 7 * 86400000;
  const recent = ordered.filter(r => Date.parse(r.submittedAt) >= cutoff && Date.parse(r.submittedAt) <= now.getTime());
  const groups = new Map();
  for (const r of ordered) for (const s of r.skills) {
    const key = s.skill.toLowerCase();
    if (!groups.has(key)) groups.set(key, { skill: s.skill, history: [], nextStep: s.nextStep });
    groups.get(key).history.push({ score: s.score, submittedAt: r.submittedAt, attemptKey: r.key, type: r.type });
  }
  const skills = [...groups.values()].map(g => ({ skill: g.skill, sampleCount: g.history.length, latest: g.history[0].score, previous: g.history[1]?.score ?? null, delta: g.history.length > 1 ? round(g.history[0].score - g.history[1].score) : null, nextStep: g.nextStep, history: g.history.slice(0, 20).reverse() })).sort((a, b) => a.latest - b.latest || a.skill.localeCompare(b.skill));
  const comparisons = testTypes.map(type => {
    const attempts = graded.filter(r => r.type === type);
    return { type, sampleCount: attempts.length, latest: attempts[0]?.score ?? null, previous: attempts[1]?.score ?? null, delta: attempts.length > 1 ? round(attempts[0].score - attempts[1].score) : null };
  }).filter(c => c.sampleCount);
  const recommendations = skills.slice(0, 3).map(s => ({ skill: s.skill, message: s.latest < 80 ? `Practice ${s.skill} twice this week. Review the weakest concept, explain it aloud, then complete a new interview. Aim for 80%.` : `Build on ${s.skill}: try a harder question and explain the tradeoffs. Aim for ${Math.min(100, s.latest + 10)}%.`, nextStep: s.nextStep, questionBankUrl: `/question-bank` }));
  if (!recommendations.length) recommendations.push({ skill: null, message: 'Complete a focused practice interview to discover your strengths and choose a study goal.', nextStep: '', questionBankUrl: '/question-bank' });
  const coding = ordered.filter(r => r.type === 'CodingPractice');
  const aiSkills = [...new Set(coding.flatMap(r => r.aiSkills || []))].map(skill => { const history = coding.filter(r => r.aiSkills?.includes(skill) && r.aiScore !== null).map(r => ({ score: r.aiScore, submittedAt: r.submittedAt })); return { skill, latest: history[0]?.score ?? null, previous: history[1]?.score ?? null, sampleCount: history.length, history: history.slice(0, 20).reverse() }; });
  return { codingPractice: { attempts: coding.length, latestAiScore: coding[0]?.aiScore ?? null, skills: aiSkills, execution: 'disabled', description: 'AI estimates only; code was not executed. These estimates are excluded from normalized scores and interview skill goals.' }, summary: { attempts: ordered.length, gradedAttempts: graded.length, averageScore: graded.length ? round(graded.reduce((sum, r) => sum + r.score, 0) / graded.length) : null, lastPracticedAt: ordered.find(r => r.submittedAt)?.submittedAt || null, sessionsLast7Days: recent.length }, skills, comparisons, recommendations };
}
async function records(db, uid) {
  const rows = await listReports(db, uid, 201);
  const counts = new Map(); let truncated = false;
  const filtered = rows.filter(r => { const source = `${r.type}:${r.subTest || ''}`; const n = (counts.get(source) || 0) + 1; counts.set(source, n); if (n > 200) { truncated = true; return false; } return true; });
  return { items: filtered.map(normalize).sort((a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0) || a.key.localeCompare(b.key)), window: { perSource: 200, truncated, scope: 'recent-attempts-per-source', description: 'Analytics use the latest 200 attempts per practice type/mock category. Older attempts remain in Reports.' } };
}
function enrichGoal(goal, items, skills, now) {
  const trend = skills.find(s => s.skill.toLowerCase() === goal.skill.toLowerCase());
  const cutoff = now.getTime() - 7 * 86400000;
  const weekCompleted = items.filter(r => Date.parse(r.submittedAt) >= cutoff && Date.parse(r.submittedAt) <= now.getTime() && r.skills.some(s => s.skill.toLowerCase() === goal.skill.toLowerCase())).length;
  const currentScore = trend?.latest ?? null;
  return { ...goal, createdAt: iso(goal.createdAt), updatedAt: iso(goal.updatedAt), currentScore, scoreGap: currentScore === null ? null : Math.max(0, round(goal.targetScore - currentScore)), weekCompleted, achieved: currentScore !== null && currentScore >= goal.targetScore && weekCompleted >= goal.weeklySessions };
}
async function overview(db, uid, now = new Date()) {
  const data = await records(db, uid), result = summarize(data.items, now);
  const goals = await goalRefs(db, uid).orderBy('createdAt', 'desc').get();
  return { ...result, window: data.window, goals: goals.docs.map(d => enrichGoal(d.data(), data.items, result.skills, now)) };
}
async function history(db, uid, params) {
  const size = pageSize(params.pageSize), data = await records(db, uid);
  if (params.type && !testTypes.includes(params.type)) throw httpError(400, 'Invalid attempt type');
  const items = params.type ? data.items.filter(r => r.type === params.type) : data.items;
  let offset = 0;
  if (params.after) { if (typeof params.after !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(params.after)) throw httpError(400, 'Invalid cursor'); const found = items.findIndex(r => r.key === params.after); if (found < 0) throw httpError(400, 'Invalid cursor'); offset = found + 1; }
  const page = items.slice(offset, offset + size);
  return { items: page, nextCursor: offset + size < items.length ? page.at(-1).key : null, window: data.window };
}
async function saveGoal(db, uid, body) {
  const skill = text(body.skill, 'skill', 60);
  if (!Number.isInteger(body.targetScore) || body.targetScore < 1 || body.targetScore > 100 || !Number.isInteger(body.weeklySessions) || body.weeklySessions < 1 || body.weeklySessions > 14) throw httpError(400, 'Use a target score of 1-100 and 1-14 weekly sessions');
  const goalId = createHash('sha256').update(skill.toLowerCase()).digest('hex');
  const ref = goalRefs(db, uid).doc(goalId);
  const goal = await db.runTransaction(async tx => {
    const doc = await tx.get(ref), old = doc.exists ? doc.data() : null;
    if (old && old.revision !== body.revision) throw httpError(409, 'Goal changed; refresh before editing');
    const value = { id: goalId, skill, targetScore: body.targetScore, weeklySessions: body.weeklySessions, revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || new Date(), updatedAt: new Date() };
    tx.set(ref, value); return value;
  });
  return { ...goal, createdAt: iso(goal.createdAt), updatedAt: iso(goal.updatedAt) };
}
async function removeGoal(db, uid, goalId, revision) {
  const ref = goalRefs(db, uid).doc(id(goalId));
  await db.runTransaction(async tx => { const doc = await tx.get(ref); if (!doc.exists) throw httpError(404, 'Goal not found'); if (doc.data().revision !== revision) throw httpError(409, 'Goal changed; refresh before deleting'); tx.delete(ref); });
}
module.exports = { normalize, summarize, overview, history, saveGoal, removeGoal };
