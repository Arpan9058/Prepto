async function extractSkills(text, jobDescription, gemini = require('../adapters/gemini').createGemini()) {
  const skills = await gemini.generate(`Extract exactly 3 technical skills as a JSON array. Introduction: ${text}. Job: ${jobDescription}`, { json: true });
  if (!Array.isArray(skills) || skills.length !== 3) throw new Error('Invalid skills');
  return skills;
}
module.exports = { extractSkills };
