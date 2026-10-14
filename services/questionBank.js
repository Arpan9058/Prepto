const { randomUUID } = require('node:crypto');
const { httpError } = require('../middleware/errors');
const { categories, difficulties, id, pageSize, publicQuestion, validateQuestion, iso } = require('../utils/product');
const bank = db => db.collection('questionBank');
const bookmarks = (db, uid) => db.collection('users').doc(uid).collection('bookmarks');
async function listQuestions(db, uid, params, admin = false) {
  const size = pageSize(params.pageSize);
  if (params.archived !== undefined && !['true', 'false'].includes(params.archived)) throw httpError(400, 'Invalid archive filter');
  if (params.archived === 'true' && !admin) throw httpError(403, 'Administrator permission required');
  let query = bank(db).where('archived', '==', params.archived === 'true');
  if (params.category) { if (!categories.includes(params.category)) throw httpError(400, 'Invalid category'); query = query.where('category', '==', params.category); }
  if (params.difficulty) { if (!difficulties.includes(params.difficulty)) throw httpError(400, 'Invalid difficulty'); query = query.where('difficulty', '==', params.difficulty); }
  if (params.q) {
    if (typeof params.q !== 'string' || !/^[\p{L}\p{N}_.+-]{2,40}$/u.test(params.q)) throw httpError(400, 'Search one keyword, 2-40 characters');
    query = query.where('searchPrefixes', 'array-contains', params.q.toLowerCase());
  }
  query = query.orderBy('createdAt', 'desc').orderBy('id', 'asc');
  if (params.after) { const cursor = await bank(db).doc(id(params.after)).get(); if (!cursor.exists) throw httpError(400, 'Invalid cursor'); query = query.startAfter(cursor); }
  const snapshot = await query.limit(size + 1).get();
  const docs = snapshot.docs.slice(0, size);
  const saved = await Promise.all(docs.map(d => bookmarks(db, uid).doc(d.id).get()));
  const owned = new Set(saved.filter(d => d.exists).map(d => d.id));
  return { items: docs.map(d => admin ? { ...d.data(), createdAt: iso(d.data().createdAt), updatedAt: iso(d.data().updatedAt), bookmarked: owned.has(d.id) } : publicQuestion(d.data(), owned.has(d.id))), nextCursor: snapshot.docs.length > size ? docs.at(-1).id : null };
}
async function question(db, questionId, admin = false) {
  const doc = await bank(db).doc(id(questionId)).get();
  if (!doc.exists || (!admin && doc.data().archived)) throw httpError(404, 'Question not found');
  return doc.data();
}
async function saveQuestion(db, actor, body, questionId) {
  const data = validateQuestion(body);
  const ref = bank(db).doc(questionId ? id(questionId) : randomUUID());
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (questionId && !doc.exists) throw httpError(404, 'Question not found');
    const old = doc.exists ? doc.data() : null;
    if (old && body.revision !== old.revision) throw httpError(409, 'Question changed; reload before editing');
    const now = new Date();
    const saved = { ...data, id: ref.id, archived: old?.archived || false, revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || now, createdBy: old?.createdBy || actor, updatedAt: now, updatedBy: actor };
    tx.set(ref, saved);
    tx.set(db.collection('questionEvents').doc(randomUUID()), { questionId: ref.id, action: old ? 'edit' : 'create', actorUid: actor, revision: saved.revision, createdAt: now });
    return { ...saved, createdAt: iso(saved.createdAt), updatedAt: iso(saved.updatedAt) };
  });
}
async function archiveQuestion(db, actor, questionId, revision) {
  const ref = bank(db).doc(id(questionId));
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw httpError(404, 'Question not found');
    const old = doc.data();
    if (revision !== old.revision) throw httpError(409, 'Question changed; reload before archiving');
    tx.update(ref, { archived: true, revision: old.revision + 1, updatedAt: new Date(), updatedBy: actor });
    tx.set(db.collection('questionEvents').doc(randomUUID()), { questionId, action: 'archive', actorUid: actor, revision: old.revision + 1, createdAt: new Date() });
  });
}
async function setBookmark(db, uid, questionId, saved) {
  id(questionId);
  const ref = bookmarks(db, uid).doc(questionId);
  if (!saved) { await ref.delete(); return; }
  await db.runTransaction(async tx => {
    const doc = await tx.get(bank(db).doc(questionId));
    if (!doc.exists || doc.data().archived) throw httpError(404, 'Question not found');
    const existing = await tx.get(ref);
    if (!existing.exists) tx.set(ref, { id: questionId, questionId, createdAt: new Date() });
  });
}
async function listBookmarks(db, uid, params) {
  const size = pageSize(params.pageSize);
  let query = bookmarks(db, uid).orderBy('createdAt', 'desc').orderBy('id', 'asc');
  if (params.after) { const cursor = await bookmarks(db, uid).doc(id(params.after)).get(); if (!cursor.exists) throw httpError(400, 'Invalid cursor'); query = query.startAfter(cursor); }
  const snap = await query.limit(size + 1).get();
  const items = await Promise.all(snap.docs.slice(0, size).map(async d => {
    const q = await bank(db).doc(d.id).get();
    return q.exists && !q.data().archived ? publicQuestion(q.data(), true) : null;
  }));
  return { items: items.filter(Boolean), nextCursor: snap.docs.length > size ? snap.docs[size - 1].id : null };
}
module.exports = { listQuestions, question, saveQuestion, archiveQuestion, setBookmark, listBookmarks };
