const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { ensureAuthenticated } = require('../middleware/auth');

// ---------------- FIRESTORE SETUP ----------------
const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// ------------------ RENDER PAGE ------------------
router.get('/mockTest', ensureAuthenticated, (req, res) => {
  res.render('mockInterview');
});

// ======================================================
//      START TEST SESSION  -->  POST /api/sessions
// ======================================================
router.post('/sessions', ensureAuthenticated, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category)
      return res.json({ success: false, message: "Category is required" });

    const questionRef = db
      .collection("questions")
      .doc(category)
      .collection("data");

    const snapshot = await questionRef.get();
    if (snapshot.empty)
      return res.json({ success: false, message: "No questions found" });

    const allQuestions = [];
    snapshot.forEach(doc => {
      allQuestions.push({
        _id: doc.id,
        ...doc.data()
      });
    });

    allQuestions.sort(() => Math.random() - 0.5);
    const limitedQuestions = allQuestions.slice(0, 5);

    const sessionId = uuidv4();
    await db.collection("sessions").doc(sessionId).set({
      sessionId,
      category,
      questions: limitedQuestions.map(q => q._id),
      createdAt: new Date(),
      completed: false
    });

    return res.json({
      success: true,
      sessionId,
      questions: limitedQuestions
    });

  } catch (err) {
    console.error("SESSION ERROR:", err);
    res.json({ success: false, message: "Server error" });
  }
});

// ======================================================
//     SUBMIT TEST SESSION --> POST /api/sessions/submit
// ======================================================
router.post('/sessions/submit', ensureAuthenticated, async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    const userUid = req.user.uid; // Firebase Auth UID

    if (!sessionId || !answers)
      return res.json({ success: false, message: "sessionId and answers required" });

    const sessionDoc = await db.collection("sessions").doc(sessionId).get();
    if (!sessionDoc.exists)
      return res.json({ success: false, message: "Session not found" });

    const sessionData = sessionDoc.data();
    const category = sessionData.category;

    const questionRef = db
      .collection("questions")
      .doc(category)
      .collection("data");

    const snapshot = await questionRef.get();
    const questionMap = {};
    snapshot.forEach(doc => questionMap[doc.id] = doc.data());

    let score = 0;
    let totalQ = sessionData.questions.length;

    let detailedReport = [];

    sessionData.questions.forEach(qId => {
      const q = questionMap[qId];
      const selected = answers[qId] || null;

      const isCorrect = q.answer && selected === q.answer;

      if (isCorrect) score++;

      detailedReport.push({
        questionId: qId,
        question: q.question,
        selectedAnswer: selected,
        correctAnswer: q.answer,
        correct: isCorrect
      });
    });

    // ------------------ BUILD FULL HTML REPORT ------------------
    let fullReport = `
      <h2 style="color:#0057ff;">Mock Test Report</h2>
      <p><strong>User ID:</strong> ${userUid}</p>
      <p><strong>Category:</strong> ${category}</p>
      <p><strong>Score:</strong> ${score}/${totalQ}</p>

      <hr style="margin:20px 0;">
      <h3>Detailed Question Analysis</h3>
    `;

    detailedReport.forEach((item, idx) => {
      fullReport += `
        <div style="padding:12px; border:1px solid #ddd; border-radius:8px; margin-bottom:15px;">
            <p><strong>Q${idx + 1}:</strong> ${item.question}</p>
            <p><strong>Your Answer:</strong> ${item.selectedAnswer}</p>
            <p><strong>Correct Answer:</strong> ${item.correctAnswer}</p>
            <p><strong>Status:</strong> <span style="color:${item.correct ? "green" : "red"};">
                ${item.correct ? "Correct" : "Incorrect"}
            </span></p>
        </div>
      `;
    });

    // ------------------ SAVE INTO FIRESTORE LIKE HR ROUND ------------------
    await db
  .collection("users")
  .doc(userUid)
  .collection("progress")
  .doc("MockTest")
  .collection(category)          // category folder inside MockTest
  .add({
    score,
    total: totalQ,
    answers: detailedReport,
    reportText: fullReport,
    submittedAt: admin.firestore.FieldValue.serverTimestamp()
  });

    // Mark session as completed
    await db.collection("sessions").doc(sessionId).update({
      completed: true
    });

    return res.json({
      success: true,
      score,
      total: totalQ,
      message: "Mock test submitted successfully!"
    });

  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    res.json({ success: false, message: "Server error" });
  }
});

// ------------------------------------------------------
module.exports = router;
