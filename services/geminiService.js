async function geminianalysis(
  text,
  question,
  questionCounter,
  jobDescription,
  gemini = require('../adapters/gemini').createGemini(),
) {
  return gemini.generate(
    `Evaluate this interview answer. Return JSON analysis, recommendation, totalScore (0-10), scores and followUpQuestion. Question ${questionCounter}: ${question}. Job: ${jobDescription}. Answer: ${text}`,
    { json: true },
  );
}
module.exports = { geminianalysis };
