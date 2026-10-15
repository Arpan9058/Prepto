const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const problems = require('../fixtures/coding-problems.json');
// Trusted test oracles, never compiled from starters, submissions or provider output.
const oracles = {
  'two-sum': (a, t) => { for (let j = 0; j < a.length; j++) for (let i = 0; i < j; i++) if (a[i] + a[j] === t) return [i, j]; return null; },
  'balanced-brackets': s => { const stack = []; for (const c of s) { if ('([{'.includes(c)) stack.push(c); else if ('([{'.indexOf(stack.pop()) !== ')]}'.indexOf(c)) return false; } return !stack.length; },
  'merge-intervals': a => { const out = []; for (const v of a.map(x => [...x]).sort((x, y) => x[0] - y[0])) { if (out.length && out.at(-1)[1] >= v[0]) out.at(-1)[1] = Math.max(v[1], out.at(-1)[1]); else out.push(v); } return out; },
  'queue-batches': (a, c) => a.reduce((s, n) => s + Math.ceil(n / c), 0),
  'stable-dedup': a => [...new Set(a)],
  'run-labels': s => { const out = []; for (const c of s) { if (out.at(-1)?.[0] === c) out.at(-1)[1]++; else out.push([c, 1]); } return out; },
  'last-unique': s => { for (let i = s.length - 1; i >= 0; i--) if (s.indexOf(s[i]) === s.lastIndexOf(s[i])) return i; return -1; },
  'rotate-window': (a, k) => Math.max(...a.slice(0, a.length - k + 1).map((_, i) => a.slice(i, i + k).reduce((s, n) => s + n, 0))),
  'gap-days': (a, limit) => { for (let d = 1; d <= limit; d++) if (!a.includes(d)) return d; return limit + 1; },
  'booking-peaks': a => a.length ? Math.max(...a.flat().map(t => a.filter(([s, e]) => s <= t && t < e).length)) : 0,
  'smallest-budget': (a, b) => { let s = 0, i = 0; while (i < a.length && s + a[i] <= b) s += a[i++]; return i; },
  'parent-path': p => { const stack = []; for (const s of p.split('/')) { if (s === '..') stack.pop(); else if (s && s !== '.') stack.push(s); } return '/' + stack.join('/'); },
  'nearest-warmer': a => a.map((t, i) => { const j = a.findIndex((x, j) => j > i && x > t); return j < 0 ? 0 : j - i; }),
  'island-sizes': grid => { const seen = new Set(); let best = 0; for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) { const queue = [[r, c]]; let size = 0; while (queue.length) { const [y, x] = queue.pop(), key = `${y},${x}`; if (!grid[y]?.[x] || seen.has(key)) continue; seen.add(key); size++; queue.push([y + 1, x], [y - 1, x], [y, x + 1], [y, x - 1]); } best = Math.max(best, size); } return best; },
  'dependency-order': (n, edges) => { const out = []; while (out.length < n) { const i = Array.from({ length: n }, (_, i) => i).find(i => !out.includes(i) && edges.every(([a, b]) => b !== i || out.includes(a))); if (i === undefined) return []; out.push(i); } return out; },
  'coin-stamps': (a, target) => { const dp = [0]; for (let i = 1; i <= target; i++) dp[i] = Math.min(Infinity, ...a.filter(v => v <= i).map(v => dp[i - v] + 1)); return dp[target] === Infinity ? -1 : dp[target]; },
  'weighted-shifts': a => { let best = 0; for (let mask = 0; mask < 2 ** a.length; mask++) if (!(mask & (mask << 1))) best = Math.max(best, a.reduce((s, v, i) => s + ((mask >> i) & 1 ? v : 0), 0)); return best; },
  'cover-tags': (s, required) => { if (!required) return ''; let best = ''; for (let i = 0; i < s.length; i++) for (let j = i + 1; j <= s.length; j++) { const sub = s.slice(i, j); if ([...required].every(c => sub.split(c).length >= required.split(c).length) && (!best || sub.length < best.length)) best = sub; } return best; }
};
const cases = {
  'two-sum': [[[[2, 7, 11], 9], [0, 1]], [[[3, 3], 6], [0, 1]], [[[], 1], null], [[[1, 1, 3], 4], [0, 2]]],
  'balanced-brackets': [[['([])'], true], [['([)]'], false], [[''], true], [[']'], false]],
  'merge-intervals': [[[[[5, 8], [1, 3], [2, 6]]], [[1, 8]]], [[[]], []], [[[[1, 2], [2, 3], [4, 4]]], [[1, 3], [4, 4]]]],
  'queue-batches': [[[[5, 0, 3], 3], 3], [[[], 2], 0], [[[6], 3], 2]],
  'stable-dedup': [[[['a', 'b', 'a', '']], ['a', 'b', '']], [[[]], []], [[['A', 'a']], ['A', 'a']]],
  'run-labels': [[['aaBBa'], [['a', 2], ['B', 2], ['a', 1]]], [[''], []], [['x'], [['x', 1]]]],
  'last-unique': [[['abac'], 3], [['aabb'], -1], [[''], -1], [[' '], 0]],
  'rotate-window': [[[[4, -2, 5, 1], 2], 6], [[[-4, -2, -7], 1], -2], [[[2, 3], 2], 5]],
  'gap-days': [[[[1, 2, 4, 7], 7], 3], [[[], 3], 1], [[[1, 2, 3], 3], 4]],
  'booking-peaks': [[[[[1, 4], [2, 3], [4, 6]]], 2], [[[[1, 2], [2, 3]]], 1], [[[]], 0]],
  'smallest-budget': [[[[2, 0, 3, 4], 5], 3], [[[0, 0], 0], 2], [[[], 1], 0], [[[3], 2], 0]],
  'parent-path': [[['/a//b/../c/.'], '/a/c'], [['/../../'], '/'], [['/.../a/..'], '/...']],
  'nearest-warmer': [[[[30, 30, 32, 31]], [2, 1, 0, 0]], [[[]], []], [[[-2, -1]], [1, 0]]],
  'island-sizes': [[[[[1, 0, 1], [1, 0, 1], [0, 0, 1]]], 3], [[[[1, 0], [0, 1]]], 1], [[[]], 0], [[[[]]], 0]],
  'dependency-order': [[[3, [[0, 2], [1, 2]]], [0, 1, 2]], [[2, [[0, 1], [1, 0]]], []], [[1, [[0, 0]]], []], [[0, []], []]],
  'coin-stamps': [[[[1, 4, 6], 8], 2], [[[4, 6], 5], -1], [[[], 0], 0], [[[1, 3, 4], 6], 2]],
  'weighted-shifts': [[[[5, 1, 2, 7]], 12], [[[2, 9, 2]], 9], [[[]], 0], [[[5]], 5]],
  'cover-tags': [[['cabbaa', 'aba'], 'baa'], [['ABC', 'aa'], ''], [['abab', 'ab'], 'ab'], [['a', ''], '']]
};
test.each(problems.map(p => [p.id, p]))('%s has reviewed contracts, starters and verified example/edge scenarios', (id, p) => {
  expect(p.examples.length).toBeGreaterThan(0); expect(p.edgeCases.length).toBeGreaterThan(1); expect(p.topics).toEqual(p.skills);
  expect(p.starter.javascript).toMatch(/^function /); expect(p.starter.python).toMatch(/^def /); expect(p.solution).toMatch(/O\(/);
  for (const [args, expected] of cases[id]) { const before = structuredClone(args); expect(oracles[id](...args)).toEqual(expected); expect(args).toEqual(before); }
});
test('library pages cover 18 unique problems and topic/difficulty filters do not expose solutions', async () => {
  const store = createFirebaseDouble(), app = createApp({ frontend: false, env: { SESSION_SECRET: 'library-review-offline-session-secret' }, firebase: store.firebase, gemini: createGeminiDouble(), logger: pino({ level: 'silent' }) });
  let cursor, found = [];
  do { const r = await request(app).get(`/api/coding/problems?pageSize=5${cursor ? '&after=' + cursor : ''}`).set('Authorization', 'Bearer alice').expect(200); found.push(...r.body.items); cursor = r.body.nextCursor; } while (cursor);
  expect(found).toHaveLength(18); expect(new Set(found.map(p => p.id)).size).toBe(18); expect(found.every(p => !p.solution)).toBe(true);
  const r = await request(app).get('/api/coding/problems?category=graphs&topic=Topological%20sort&difficulty=hard').set('Authorization', 'Bearer alice').expect(200);
  expect(r.body.items.map(p => p.id)).toEqual(['dependency-order']); expect(r.body.execution.executed).toBe(false);
  await request(app).get('/api/coding/problems?topic=unknown').set('Authorization', 'Bearer alice').expect(400);
});
