const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const admin = require('firebase-admin');

const db = admin.firestore();

const testTypes = ['CodingTest', 'HRInterview', 'MockTest', 'TechnicalInterview'];
const mockSubTests = [
  'aptitude',
  'reasoning',
  'automata',
  'englishComprehension',
  'personality'
];

// ----------------------------------------------------
// LOAD REPORT LIST PAGE
// ----------------------------------------------------
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const userUid = req.user.uid;
    const reports = [];

    for (const type of testTypes) {

      // ------------ MOCK TESTS (sub-categories) ---------------
      if (type === "MockTest") {
        for (const sub of mockSubTests) {
          const snap = await db.collection('users')
            .doc(userUid)
            .collection('progress')
            .doc(type)
            .collection(sub)
            .orderBy('submittedAt', 'desc')
            .get();

          snap.forEach(doc => {
            const d = doc.data();
            reports.push({
              id: doc.id,
              type,
              subTest: sub,
              score: d.score || d.totalScore || 0,
              submittedAt: d.submittedAt?.toDate().toLocaleString(),
              raw: d
            });
          });
        }
      }

      // ------------ CODING, HR, TECHNICAL -------------------
      else {
        const snap = await db.collection('users')
          .doc(userUid)
          .collection('progress')
          .doc(type)
          .collection('attempts')
          .orderBy('submittedAt', 'desc')
          .get();

        snap.forEach(doc => {
          const d = doc.data();
          reports.push({
            id: doc.id,
            type,
            subTest: null,
            score: d.score || d.totalScore || 0,
            submittedAt: d.submittedAt?.toDate().toLocaleString(),
            raw: d
          });
        });
      }
    }

    res.render('reports', { reports });

  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).send("Error loading reports");
  }
});


// ----------------------------------------------------
// VIEW SPECIFIC REPORT PAGE
// ----------------------------------------------------
router.get('/view/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userUid = req.user.uid;
    const attemptId = req.params.id;
    const { type, sub } = req.query;

    let docRef;

    if (type === "MockTest") {
      docRef = db.collection('users')
        .doc(userUid)
        .collection('progress')
        .doc("MockTest")
        .collection(sub)
        .doc(attemptId);
    } else {
      docRef = db.collection('users')
        .doc(userUid)
        .collection('progress')
        .doc(type)
        .collection('attempts')
        .doc(attemptId);
    }

    const snap = await docRef.get();
    if (!snap.exists) return res.send("Report not found.");

    const data = snap.data();

    res.render('testReport', {
      type,
      sub,
      submittedAt: data.submittedAt?.toDate().toLocaleString(),
      score: data.score || data.totalScore || 0,
      fullReport: data.fullReport || data.reportText || ""
    });

  } catch (err) {
    console.error("View error:", err);
    res.status(500).send("Error loading report.");
  }
});


// ----------------------------------------------------
// DOWNLOAD REPORT
// ----------------------------------------------------
router.get('/download/:id', ensureAuthenticated, (req, res) => {
  try {
    const jsonString = decodeURIComponent(req.query.data);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=report-${req.params.id}.json`
    );
    res.setHeader('Content-Type', 'application/json');

    res.send(jsonString);

  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Error downloading file");
  }
});


module.exports = router;
