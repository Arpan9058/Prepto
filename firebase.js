// Importing this module never initializes Firebase or reads credentials.
const { getFirebase } = require('./adapters/firebase');
function auth() {
  return getFirebase().auth();
}
function firestore() {
  return getFirebase().firestore();
}
Object.defineProperty(firestore, 'FieldValue', { get: () => getFirebase().firestore.FieldValue });
module.exports = { auth, firestore };
