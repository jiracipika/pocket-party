'use strict';
// Node built-in test runner: node --test games/turbo-kart/meta.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const Meta = require('./meta.js');

test('seedFromDate: deterministic, uint32, pinned FNV-1a value', () => {
  const a = Meta.seedFromDate('2026-09-29');
  assert.equal(a, Meta.seedFromDate('2026-09-29'), 'same date -> same seed');
  assert.ok(Number.isInteger(a) && a >= 0 && a <= 0xffffffff, 'seed within uint32');
  assert.equal(a, 2345823653, 'pinned FNV-1a value for 2026-09-29 (family-wide)');
  const seen = new Set(['2026-09-28', '2026-09-29', '2026-09-30', '2027-01-01'].map(Meta.seedFromDate));
  assert.equal(seen.size, 4, 'distinct dates map to distinct seeds');
});

test('pushHistory: upserts per day, keeps the best, sorted, capped, pure', () => {
  const h0 = [];
  const h1 = Meta.pushHistory(h0, '2026-10-08', 120);
  assert.deepEqual(h1, [{ d: '2026-10-08', s: 120 }]);
  assert.deepEqual(h0, [], 'input array untouched');
  const h2 = Meta.pushHistory(h1, '2026-10-08', 90);
  assert.deepEqual(h2, [{ d: '2026-10-08', s: 120 }], 'keeps the day best');
  const h3 = Meta.pushHistory(h2, '2026-10-08', 5000);
  assert.deepEqual(h3, [{ d: '2026-10-08', s: 5000 }], 'upgrades the day best');
  let h = Meta.pushHistory(h3, '2026-10-09', 4100);
  h = Meta.pushHistory(h, '2026-10-10', 6200);
  assert.deepEqual(h.map(e => e.d), ['2026-10-08', '2026-10-09', '2026-10-10'], 'sorted by day');
  for (let d = 1; d <= 40; d++) {
    h = Meta.pushHistory(h, '2026-11-' + String(d).padStart(2, '0'), d * 100);
  }
  assert.equal(h.length, 30, 'ring cap holds at 30 entries');
  assert.equal(h[h.length - 1].d, '2026-11-40', 'latest day kept');
});
