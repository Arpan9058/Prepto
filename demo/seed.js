const resumes = require('../services/resumes');
const matches = require('../services/resumeMatches');
const interviews = require('../services/interviews');
const coding = require('../services/codingPractice');
const progress = require('../services/progress');
async function seedUser(db, gemini, uid) {
  const first = await resumes.create(db, uid, { title: 'Synthetic candidate · Backend resume', label: 'General', text: 'Mira Demo · candidate@example.test\nSynthetic candidate for demonstration only.\nSkills: Node.js, SQL.\nProject: built an example API for a fictional shop.', requestId: 'sample-resume' });
  const second = await resumes.addVersion(db, uid, first.resume.id, { text: first.version.text + '\nVersion 2: added an example API testing project and SQL indexing notes.', label: 'Backend role', expectedRevision: 1, requestId: 'sample-version-two' });
  for (const [index, version] of [first.version, second.version].entries()) await matches.create(db, gemini, uid, { resumeId: first.resume.id, resumeVersionId: version.id, jobTitle: 'Synthetic backend role', jobDescription: 'Fictional role: build Node.js APIs, SQL queries and TypeScript services.', requestId: `sample-match-${index}` });
  let session = await interviews.start(db, uid, { title: 'Synthetic interview · Event loop', questionIds: ['sample-01'] });
  session = await interviews.submitAnswer(db, gemini, uid, session.id, { questionId: 'sample-01', text: 'Synthetic example: the event loop schedules asynchronous callbacks; a long callback can delay other work.', requestId: 'sample-answer', version: session.version });
  await interviews.complete(db, uid, session.id, session.version);
  await coding.saveDraft(db, uid, { problemId: 'two-sum', language: 'javascript', code: '// Synthetic draft. This code is not executed.\nfunction pairSum(values, target) {\n  return null;\n}', revision: 0 });
  await coding.submit(db, gemini, uid, { problemId: 'two-sum', language: 'javascript', code: '// Synthetic submission for review, not execution.\nfunction pairSum(values, target) { return null; }', requestId: 'sample-coding-review' });
  await progress.saveGoal(db, uid, { skill: 'Node.js', targetScore: 80, weeklySessions: 2 });
  await require('../services/questionBank').setBookmark(db, uid, 'sample-01', true);
}
module.exports = { seedUser };
