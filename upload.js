const admin = require("firebase-admin");
const questions = require("./questionsData");

// IMPORTANT: use your service-account.json file
admin.initializeApp({
    credential: admin.credential.cert("./firebase-service-account.json.json")
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

async function uploadQuestions() {
  try {
    console.log("Total questions:", questions.length);

    for (const q of questions) {
      if (!q.category) {
        console.log("Question has no category:", q);
        continue;
      }

      const categoryPath = `questions/${q.category}/data`;

      await db.collection(categoryPath).add({
        question: q.question,
        options: q.options,
        answer: q.answer,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Added -> ${q.category}`);
    }

    console.log("Done uploading category-wise.");

  } catch (err) {
    console.error("Upload error:", err);
  }
}

uploadQuestions();