const sanitizeHtml = require('sanitize-html');
const { marked } = require('marked');
const testTypes = ['CodingTest', 'HRInterview', 'MockTest', 'TechnicalInterview'];
const mockSubTests = ['aptitude', 'reasoning', 'automata', 'englishComprehension', 'personality'];
function safeHtml(html) { return sanitizeHtml(String(html), { allowedAttributes: {}, allowedTags: sanitizeHtml.defaults.allowedTags }); }
function markdown(text) { return safeHtml(marked.parse(String(text))); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function answerReport(title, answers) {
  return `<h2>${escapeHtml(title)}</h2>` + answers.map(a =>
    `<section><p>${escapeHtml(a.question)}</p><p>${escapeHtml(a.answer ?? a.selectedAnswer)}</p><p>${escapeHtml(a.analysis)}</p><p>${escapeHtml(a.recommendation)}</p><p>Score: ${escapeHtml(a.score ?? a.totalScore ?? (a.correct === undefined ? '' : a.correct ? 1 : 0))}</p>${a.correctAnswer === undefined ? '' : `<p>Correct answer: ${escapeHtml(a.correctAnswer)}</p>`}</section>`).join('');
}
function attempts(db, uid, type, sub) { return db.collection('users').doc(uid).collection('progress').doc(type).collection(type === 'MockTest' ? sub : 'attempts'); }
function validReport(type, sub) { return testTypes.includes(type) && (type !== 'MockTest' || mockSubTests.includes(sub)); }
function formatDate(value) { return value?.toDate ? value.toDate().toISOString() : value instanceof Date ? value.toISOString() : 'N/A'; }
async function listReports(db, uid) {
  const reports = [];
  for (const type of testTypes) for (const sub of type === 'MockTest' ? mockSubTests : [null]) {
    const snapshot = await attempts(db, uid, type, sub).orderBy('submittedAt', 'desc').get();
    for (const doc of snapshot.docs) {
      const d = doc.data();
      reports.push({ id: doc.id, type, subTest: sub, score: d.score ?? d.totalScore ?? 0, submittedAt: formatDate(d.submittedAt), raw: { ...d, fullReport: safeHtml(d.fullReport || d.reportText || '') } });
    }
  }
  return reports;
}
module.exports = { safeHtml, markdown, escapeHtml, answerReport, attempts, validReport, formatDate, listReports, testTypes, mockSubTests };
