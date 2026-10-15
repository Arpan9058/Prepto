const admin = require('./firebase');
const questions = require('./questionsData');
const categories = {
  'English Comprehension': 'englishComprehension',
  Aptitude: 'aptitude',
  Reasoning: 'reasoning',
  Automata: 'automata',
  Personality: 'personality',
  coding: 'automata',
};
async function uploadQuestions() {
  const db = admin.firestore();
  const batch = db.batch();
  questions.forEach((q, index) => {
    const category = categories[q.category] || q.category;
    if (category === 'Essay') return; // Essay prompts are not multiple-choice questions.
    if (!require('./utils/reports').mockSubTests.includes(category))
      throw new Error('Unknown question category');
    batch.set(db.collection('questions').doc(category).collection('data').doc(`seed-${index}`), {
      question: q.question,
      options: q.options,
      answer: q.answer,
    });
  });
  await batch.commit();
}
if (require.main === module) {
  require('dotenv').config({ quiet: true });
  uploadQuestions().catch(() => {
    console.error('Question upload failed');
    process.exitCode = 1;
  });
}
module.exports = { uploadQuestions };
