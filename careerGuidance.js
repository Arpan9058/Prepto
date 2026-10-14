async function analyzeWithGemini(skills, gemini = require('./adapters/gemini').createGemini()) {
  return gemini.generate(`Provide career paths, roles, certifications, growth and India/US salary ranges matching these skills: ${skills}`);
}
module.exports = { analyzeWithGemini };
