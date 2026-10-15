const { createMemoryStore } = require('../adapters/memoryStore');
function createFirebaseDouble(seed = {}) {
  const { db, records } = createMemoryStore(seed);
  const verifyIdToken = jest.fn(async token => {
    if (!['alice', 'bob', 'admin'].includes(token)) throw new Error('Invalid token containing private information');
    return { uid: token, admin: token === 'admin', email: `${token}@example.test` };
  });
  const firebase = { firestore: () => db, auth: () => ({ verifyIdToken }) };
  return { firebase, records, db, verifyIdToken };
}
function createGeminiDouble() {
  return { model: 'offline-double', generate: jest.fn(async (prompt, options) => {
    if (!options?.json) return '**Useful result**<script>alert("x")</script>';
    if (prompt.startsWith('Review coding practice')) return { score: 75, summary: 'Good approach; inspect edge cases.', improvements: ['Handle empty input explicitly'] };
    if (prompt.startsWith('Match resume version')) return { score: 76, summary: 'Good Node.js alignment; strengthen typed APIs.', matchedSkills: ['Node.js', 'PostgreSQL'], missingSkills: ['TypeScript'], recommendations: ['Add a concrete typed API project and measurable outcomes.'] };
    if (prompt.startsWith('Extract')) return ['Node.js', 'SQL', 'JavaScript'];
    if (prompt.includes('HR interview')) return { score: 4, analysis: 'Clear answer', recommendation: 'Add an example' };
    if (prompt.startsWith('Evaluate practice')) return { score: 70, feedback: 'Good explanation with a clear example.', nextStep: 'Practice explaining the tradeoff in your own words.' };
    if (prompt.startsWith('Evaluate this')) return { score: 80, feedback: { implementation: 'Correct', suggestions: ['Add tests'] } };
    return { totalScore: 8, analysis: 'Good answer', recommendation: 'Expand', followUpQuestion: 'Explain a tradeoff', scores: { technicalKnowledge: 8 } };
  }) };
}
module.exports = { createFirebaseDouble, createGeminiDouble };
