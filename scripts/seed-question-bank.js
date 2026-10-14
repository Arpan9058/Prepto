const { validateQuestion, id } = require('../utils/product');
async function seed(db) {
  let created = 0;
  for (const sample of require('../fixtures/question-bank.json')) {
    const ref = db.collection('questionBank').doc(id(sample.id));
    const added = await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (doc.exists) return false; // Never overwrite an administrator's edits.
      tx.set(ref, { ...validateQuestion(sample), id: sample.id, archived: false, revision: 1, createdBy: 'seed-script', updatedBy: 'seed-script', createdAt: new Date(), updatedAt: new Date() });
      return true;
    });
    if (added) created++;
  }
  return created;
}
if (require.main === module) { require('dotenv').config({ quiet: true }); seed(require('../firebase').firestore()).then(n => console.log(`${n} sample questions added`)).catch(() => { console.error('Seed failed'); process.exitCode = 1; }); }
module.exports = { seed };
