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
  function collection(path, options = {}) {
    const order = options.order || [];
    const compare = (a, b) => {
      for (const [field, direction] of order) {
        const av = a.data()[field], bv = b.data()[field];
        const diff = av > bv ? 1 : av < bv ? -1 : 0;
        if (diff) return diff * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    };
    return { path, doc: id => doc(`${path}/${id || randomUUID()}`),
      add: async data => { const ref = doc(`${path}/${randomUUID()}`); await ref.set(data); return ref; },
      where: (field, op, value) => collection(path, { ...options, filters: [...(options.filters || []), [field, op, value]] }),
      orderBy: (field, direction = 'asc') => collection(path, { ...options, order: [...order, [field, direction]] }),
      limit: count => collection(path, { ...options, count }),
      startAfter: cursor => collection(path, { ...options, cursor }),
      get: async () => {
        let docs = [...records.keys()].filter(p => p.startsWith(path + '/') && p.split('/').length === path.split('/').length + 1).map(snapshot);
        for (const [field, op, value] of options.filters || []) docs = docs.filter(d => {
          const actual = d.data()[field];
          if (op === '==') return actual === value;
          if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
          if (op === 'in') return value.includes(actual);
          throw new Error(`Unsupported mock query operator ${op}`);
        });
        if (order.length) docs.sort(compare);
        if (options.cursor) docs = docs.filter(d => compare(d, options.cursor) > 0);
        if (options.count) docs = docs.slice(0, options.count);
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
          delete: ref => writes.push(() => records.delete(ref.path)),
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
    if (!['alice', 'bob', 'admin'].includes(token)) throw new Error('Invalid token containing private information');
    return { uid: token, admin: token === 'admin', email: `${token}@example.test` };
  });
  const firebase = { firestore: () => db, auth: () => ({ verifyIdToken }) };
  return { firebase, records, db, verifyIdToken };
}
function createGeminiDouble() {
  return { model: 'offline-double', generate: jest.fn(async (prompt, options) => {
    if (!options?.json) return '**Useful result**<script>alert("x")</script>';
    if (prompt.startsWith('Review coding practice')) return { score: 75, summary: 'Good approach; inspect edge cases.', improvements: ['Handle empty input explicitly'] };
    if (prompt.startsWith('Match resume version')) return { score: 76, summary: 'Good Node.js alignment; strengthen typed APIs.', matchedSkills: ['Node.js', 'PostgreSQL'], missingSkills: ['TypeScript'], recommendations: ['Add a concrete typed API project and measurable outcomes.'] };
    if (prompt.startsWith('Extract')) return ['Node.js', 'SQL', 'JavaScript'];
    if (prompt.includes('HR interview')) return { score: 4, analysis: 'Clear answer', recommendation: 'Add an example' };
    if (prompt.startsWith('Evaluate practice')) return { score: 70, feedback: 'Good explanation with a clear example.', nextStep: 'Practice explaining the tradeoff in your own words.' };
    if (prompt.startsWith('Evaluate this')) return { score: 80, feedback: { implementation: 'Correct', suggestions: ['Add tests'] } };
    return { totalScore: 8, analysis: 'Good answer', recommendation: 'Expand', followUpQuestion: 'Explain a tradeoff', scores: { technicalKnowledge: 8 } };
  }) };
}
module.exports = { createFirebaseDouble, createGeminiDouble };
