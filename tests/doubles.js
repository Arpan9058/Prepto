const { randomUUID } = require('node:crypto');
function clone(value) { return structuredClone(value); }
function createFirebaseDouble(seed = {}) {
  const records = new Map(Object.entries(seed).map(([p, d]) => [p, clone(d)]));
  function snapshot(path) {
    const data = records.get(path);
    return { id: path.split('/').pop(), exists: data !== undefined, data: () => clone(data) };
  }
  function doc(path) {
    return { path, id: path.split('/').pop(), collection: name => collection(`${path}/${name}`),
      get: async () => snapshot(path), set: async data => { records.set(path, clone(data)); },
      update: async data => { records.set(path, { ...records.get(path), ...clone(data) }); },
      delete: async () => { records.delete(path); } };
  }
  function collection(path, order) {
    return { path, doc: id => doc(`${path}/${id || randomUUID()}`),
      add: async data => { const ref = doc(`${path}/${randomUUID()}`); await ref.set(data); return ref; },
      orderBy: (field, direction) => collection(path, { field, direction }),
      get: async () => {
        const docs = [...records.keys()].filter(p => p.startsWith(path + '/') && p.split('/').length === path.split('/').length + 1).map(snapshot);
        if (order) docs.sort((a, b) => ((a.data()[order.field] > b.data()[order.field]) ? 1 : -1) * (order.direction === 'desc' ? -1 : 1));
        return { docs, empty: docs.length === 0, forEach: fn => docs.forEach(fn) };
      } };
  }
  let queue = Promise.resolve();
  const db = { collection,
    // Serialize transactions, stage writes, and commit only after callback success.
    runTransaction(fn) {
      const task = queue.then(async () => {
        const writes = [];
        const result = await fn({ get: async ref => snapshot(ref.path),
          set: (ref, data) => writes.push(() => records.set(ref.path, clone(data))),
          update: (ref, data) => writes.push(() => records.set(ref.path, { ...records.get(ref.path), ...clone(data) })) });
        writes.forEach(write => write());
        return result;
      });
      queue = task.catch(() => {});
      return task;
    },
    batch: () => {
      const writes = [];
      return { set: (ref, value) => writes.push([ref, value]), commit: async () => { for (const [ref, value] of writes) await ref.set(value); } };
    }
  };
  const verifyIdToken = jest.fn(async token => {
    if (!['alice', 'bob'].includes(token)) throw new Error('Invalid token containing private information');
    return { uid: token, email: `${token}@example.test` };
  });
  const firebase = { firestore: () => db, auth: () => ({ verifyIdToken }) };
  return { firebase, records, db, verifyIdToken };
}
function createGeminiDouble() {
  return { generate: jest.fn(async (prompt, options) => {
    if (!options?.json) return '**Useful result**<script>alert("x")</script>';
    if (prompt.startsWith('Extract')) return ['Node.js', 'SQL', 'JavaScript'];
    if (prompt.includes('HR interview')) return { score: 4, analysis: 'Clear answer', recommendation: 'Add an example' };
    if (prompt.startsWith('Evaluate this')) return { score: 80, feedback: { implementation: 'Correct', suggestions: ['Add tests'] } };
    return { totalScore: 8, analysis: 'Good answer', recommendation: 'Expand', followUpQuestion: 'Explain a tradeoff', scores: { technicalKnowledge: 8 } };
  }) };
}
module.exports = { createFirebaseDouble, createGeminiDouble };
