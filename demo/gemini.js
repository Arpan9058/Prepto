// Fixed synthetic illustrations, never a model call or code evaluation.
const note = 'Synthetic demo feedback. Fixed illustration; not a real assessment.';
function createDemoGemini() {
  return { model: 'synthetic-offline-demo', async generate(prompt, options = {}) {
    if (prompt.startsWith('Review coding practice')) return { score: 72, summary: note, improvements: ['Illustration: discuss input boundaries and complexity. Code was not executed.'] };
    if (prompt.startsWith('Match resume version')) return { score: 76, summary: note, matchedSkills: ['Node.js'], missingSkills: ['TypeScript'], recommendations: ['Illustration: describe a typed API project with measurable impact.'] };
    if (prompt.startsWith('Evaluate practice')) return { score: 70, feedback: note, nextStep: 'Illustration: explain one scheduling tradeoff.' };
    if (!options.json) return note;
    throw new Error('This workflow has no synthetic demo response');
  } };
}
module.exports = { createDemoGemini };
