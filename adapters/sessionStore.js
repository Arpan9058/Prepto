const session = require('express-session');
class FirestoreSessionStore extends session.Store {
  constructor(firebase) { super(); this.firebase = firebase; }
  ref(sid) { return this.firebase.firestore().collection('webSessions').doc(sid); }
  get(sid, callback) {
    this.ref(sid).get().then(doc => {
      if (!doc.exists || doc.data().expiresAt.toDate() <= new Date()) return callback(null, null);
      callback(null, JSON.parse(doc.data().value));
    }).catch(callback);
  }
  set(sid, value, callback = () => {}) {
    this.ref(sid).set({ value: JSON.stringify(value), expiresAt: new Date(value.cookie.expires || Date.now() + 3600000) }).then(() => callback()).catch(callback);
  }
  destroy(sid, callback = () => {}) { this.ref(sid).delete().then(() => callback()).catch(callback); }
  touch(sid, value, callback) { this.set(sid, value, callback); }
}
module.exports = { FirestoreSessionStore };
