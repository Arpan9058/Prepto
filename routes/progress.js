const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Updated paths
const testTypes = ['CodingTest', 'HRInterview', 'MockTest'];
const mockSubTests = ['aptitude', 'reasoning', 'automata', 'englishComprehension', 'personality'];

router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const userUid = req.user.uid;

    if (!userUid) {
      return res.status(400).send('User not logged in or UID missing');
    }

    const progressData = {};

    for (const type of testTypes) {
      if (type === 'MockTest') {
        progressData[type] = {};

        for (const sub of mockSubTests) {
          const snapshot = await db
            .collection('users')
            .doc(userUid)
            .collection('progress')
            .doc('MockTest')
            .collection(sub)  // path matches `/progress/MockTest/aptitude`
            .orderBy('submittedAt', 'asc')
            .get();

          progressData[type][sub] = snapshot.docs.map(doc => ({
            id: doc.id,
            score: doc.data().score || doc.data().totalScore || 0,
            submittedAt: doc.data().submittedAt
              ? doc.data().submittedAt.toDate().toLocaleDateString()
              : 'N/A'
          }));
        }
      } else if (type === 'HRInterview' || type === 'CodingTest') {
        const snapshot = await db
          .collection('users')
          .doc(userUid)
          .collection('progress')
          .doc(type)
          .collection('attempts') // path matches `/progress/HRInterview/attempts` etc.
          .orderBy('submittedAt', 'asc')
          .get();

        progressData[type] = snapshot.docs.map(doc => ({
          id: doc.id,
          score: doc.data().score || doc.data().totalScore || 0,
          submittedAt: doc.data().submittedAt
            ? doc.data().submittedAt.toDate().toLocaleDateString()
            : 'N/A'
        }));
      }
    }

    res.render('progressDashboard', { progressData, testTypes, mockSubTests });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).send('Error fetching progress dashboard');
  }
});

module.exports = router;
