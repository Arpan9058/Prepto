const { randomUUID, createHash } = require('node:crypto');
const { extractTextFromFile } = require('../ats');
const { httpError } = require('../middleware/errors');
const { id, text, pageSize, iso } = require('../utils/product');
const { escapeHtml } = require('../utils/reports');
const roots = (db, uid) => db.collection('users').doc(uid).collection('resumes');
const hash = value => createHash('sha256').update(value).digest('hex');
function owned(doc, uid) { if (!doc.exists || doc.data().ownerUid !== uid) throw httpError(404, 'Resume not found'); return doc.data(); }
function resumeView(raw) { return { id: raw.id, title: raw.title, currentVersionId: raw.currentVersionId, versionCount: raw.versionCount, revision: raw.revision, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt) }; }
function versionView(raw, includeText = true) { const value = { id: raw.id, resumeId: raw.resumeId, number: raw.number, label: raw.label, source: raw.source, characterCount: raw.characterCount, contentHash: raw.contentHash, createdAt: iso(raw.createdAt) }; if (includeText) value.text = raw.text; return value; }
function cleanFileName(value) { return [...value].map(c => c === '/' || c === '\\' || c.codePointAt(0) < 32 || c.codePointAt(0) === 127 ? '_' : c).join('').slice(0, 180); }
async function content(body, file) {
  const value = text(file ? await extractTextFromFile(file) : body.text, 'resume text (1-50000 characters)', 50000);
  const source = file ? { kind: /\.pdf$/i.test(file.originalname) ? 'pdf' : 'docx', fileName: cleanFileName(file.originalname) } : { kind: 'text' };
  const label = body.label === undefined || body.label === '' ? null : text(body.label, 'version label', 100);
  return { value, source, label, contentHash: hash(value) };
}
async function create(db, uid, body, file) {
  const title = text(body.title, 'resume title', 120), data = await content(body, file);
  const resumeId = body.requestId ? id(body.requestId) : randomUUID(), versionId = randomUUID();
  const ref = roots(db, uid).doc(resumeId), fingerprint = hash(JSON.stringify({ title, text: data.value, source: data.source, label: data.label }));
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (doc.exists) {
      const current = owned(doc, uid);
      if (current.createFingerprint !== fingerprint) throw httpError(409, 'Request ID already used for different resume content');
      const initial = await tx.get(ref.collection('versions').doc(current.initialVersionId));
      return { resume: resumeView(current), version: versionView(initial.data()), replayed: true };
    }
    const now = new Date();
    const version = { id: versionId, resumeId, ownerUid: uid, number: 1, label: data.label || 'Version 1', text: data.value, source: data.source, characterCount: data.value.length, contentHash: data.contentHash, createdAt: now };
    const resume = { id: resumeId, ownerUid: uid, title, currentVersionId: versionId, initialVersionId: versionId, versionCount: 1, revision: 1, createFingerprint: fingerprint, createdAt: now, updatedAt: now };
    tx.set(ref, resume); tx.set(ref.collection('versions').doc(versionId), version);
    return { resume: resumeView(resume), version: versionView(version), replayed: false };
  });
}
async function get(db, uid, resumeId) { return resumeView(owned(await roots(db, uid).doc(id(resumeId)).get(), uid)); }
async function list(db, uid, params) {
  const size = pageSize(params.pageSize); let query = roots(db, uid).orderBy('createdAt', 'desc').orderBy('id');
  if (params.after) { const cursor = await roots(db, uid).doc(id(params.after)).get(); owned(cursor, uid); query = query.startAfter(cursor); }
  const snapshot = await query.limit(size + 1).get(), docs = snapshot.docs.slice(0, size);
  return { items: docs.filter(d => d.data().ownerUid === uid).map(d => resumeView(d.data())), nextCursor: snapshot.docs.length > size ? docs.at(-1).id : null };
}
async function getVersion(db, uid, resumeId, versionId) {
  const ref = roots(db, uid).doc(id(resumeId)); owned(await ref.get(), uid);
  const doc = await ref.collection('versions').doc(id(versionId)).get();
  if (!doc.exists || doc.data().ownerUid !== uid || doc.data().resumeId !== resumeId) throw httpError(404, 'Resume version not found');
  return versionView(doc.data());
}
async function listVersions(db, uid, resumeId, params) {
  const ref = roots(db, uid).doc(id(resumeId)); owned(await ref.get(), uid);
  const size = pageSize(params.pageSize); let query = ref.collection('versions').orderBy('number', 'desc').orderBy('id');
  if (params.after) { const cursor = await ref.collection('versions').doc(id(params.after)).get(); if (!cursor.exists || cursor.data().ownerUid !== uid) throw httpError(400, 'Invalid version cursor'); query = query.startAfter(cursor); }
  const snap = await query.limit(size + 1).get();
  return { items: snap.docs.slice(0, size).filter(d => d.data().ownerUid === uid).map(d => versionView(d.data(), false)), nextCursor: snap.docs.length > size ? snap.docs[size - 1].id : null };
}
async function addVersion(db, uid, resumeId, body, file) {
  const ref = roots(db, uid).doc(id(resumeId)); owned(await ref.get(), uid); // Deny before parsing or calling providers.
  const data = await content(body, file), versionId = body.requestId ? id(body.requestId) : randomUUID(), versionRef = ref.collection('versions').doc(versionId);
  return db.runTransaction(async tx => {
    const current = owned(await tx.get(ref), uid), existing = await tx.get(versionRef);
    if (existing.exists) {
      const old = existing.data();
      if (old.ownerUid !== uid || old.contentHash !== data.contentHash || (data.label !== null && old.label !== data.label) || JSON.stringify(old.source) !== JSON.stringify(data.source)) throw httpError(409, 'Request ID already used for different version content');
      return { resume: resumeView(current), version: versionView(old), replayed: true };
    }
    if (Number(body.expectedRevision) !== current.revision) throw httpError(409, 'Resume changed; refresh before saving a new version');
    const now = new Date(), number = current.versionCount + 1;
    const version = { id: versionId, resumeId, ownerUid: uid, number, label: data.label || `Version ${number}`, text: data.value, source: data.source, characterCount: data.value.length, contentHash: data.contentHash, createdAt: now };
    const saved = { ...current, versionCount: number, currentVersionId: versionId, revision: current.revision + 1, updatedAt: now };
    tx.set(ref, saved); tx.set(versionRef, version);
    return { resume: resumeView(saved), version: versionView(version), replayed: false };
  });
}
async function setCurrent(db, uid, resumeId, body) {
  const ref = roots(db, uid).doc(id(resumeId)); const versionId = id(body.versionId);
  return db.runTransaction(async tx => {
    const current = owned(await tx.get(ref), uid), version = await tx.get(ref.collection('versions').doc(versionId));
    if (!version.exists || version.data().ownerUid !== uid) throw httpError(404, 'Resume version not found');
    if (current.currentVersionId === versionId) return resumeView(current);
    if (Number(body.expectedRevision) !== current.revision) throw httpError(409, 'Resume changed; refresh before selecting a version');
    const saved = { ...current, currentVersionId: versionId, revision: current.revision + 1, updatedAt: new Date() };
    tx.set(ref, saved); return resumeView(saved);
  });
}
async function pdfHtml(db, uid, resumeId, versionId) {
  const resume = await get(db, uid, resumeId), version = await getVersion(db, uid, resumeId, versionId);
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font:12pt sans-serif;padding:32px}section{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>${escapeHtml(resume.title)}</h1><section>${escapeHtml(version.text)}</section></body></html>`;
}
module.exports = { create, get, list, getVersion, listVersions, addVersion, setCurrent, pdfHtml, hash };
