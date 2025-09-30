const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json'); // adjust path if needed

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
