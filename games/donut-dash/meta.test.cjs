'use strict';
// Node built-in test runner: node --test games/donut-dash/meta.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const Meta = require('./meta.js');

test('seedFromDate: deterministic, uint32, input-sensitive', () => {
  const a = Meta.seedFromDate('2026-09-29');
  assert.equal(a, Meta.seedFromDate('2026-09-29'), 'same date -> same seed');
  assert.ok(Number.isInteger(a) && a >= 0 && a <= 0xffffffff, 'seed within uint32');
  // pinned value: algorithm changes must be a conscious break, not an accident
  assert.equal(a, 2345823653, 'pinned FNV-1a value for 2026-09-29');
  const dates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
    '2026-12-25', '2027-01-01', '1999-12-31', '2030-06-15'];
  const seen = new Set(dates.map(Meta.seedFromDate));
  assert.ok(seen.size >= dates.length - 1, 'distinct dates mostly map to distinct seeds');
});

test('pushHistory: upserts per day, keeps the best, sorted, capped, pure', () => {
  const h0 = [];
  const h1 = Meta.pushHistory(h0, '2026-09-27', 120);
  assert.deepEqual(h1, [{ d: '2026-09-27', m: 120 }]);
  assert.deepEqual(h0, [], 'input array untouched');
  const h2 = Meta.pushHistory(h1, '2026-09-27', 90);   // worse run, same day
  assert.deepEqual(h2, [{ d: '2026-09-27', m: 120 }], 'keeps the day best');
  const h3 = Meta.pushHistory(h2, '2026-09-27', 200);  // better run, same day
  assert.deepEqual(h3, [{ d: '2026-09-27', m: 200 }], 'upgrades the day best');
  let h = Meta.pushHistory(h3, '2026-09-28', 150);
  h = Meta.pushHistory(h, '2026-09-29', 175);
  assert.deepEqual(h.map(e => e.d), ['2026-09-27', '2026-09-28', '2026-09-29'], 'sorted by day');
  for (let d = 1; d <= 40; d++) {
    h = Meta.pushHistory(h, '2026-10-' + String(d).padStart(2, '0'), d);
  }
  assert.equal(h.length, 30, 'ring cap holds at 30 entries');
  assert.equal(h[h.length - 1].d, '2026-10-40', 'latest day kept');
});

test('missions: thresholds, purity, first-completion date sticks', () => {
  const done0 = {};
  const r1 = { meters: 299, hits: 0, bestChain: 3, dayKey: '2026-09-29' };
  const d1 = Meta.evaluateMissions(done0, r1);
  assert.deepEqual(d1, {}, '299m clean is not enough');
  const r2 = { meters: 300, hits: 0, bestChain: 3, dayKey: '2026-09-29' };
  const d2 = Meta.evaluateMissions(done0, r2);
  assert.equal(d2.m300, '2026-09-29', '300m clean completes m300');
  assert.equal(d2.chain15, undefined, 'chain mission still open');
  const r3 = { meters: 310, hits: 1, bestChain: 3, dayKey: '2026-09-30' };
  const d3 = Meta.evaluateMissions(d2, r3);
  assert.equal(d3.m300, '2026-09-29', 'completion date sticks after a crashy run');
  const r4 = { meters: 310, hits: 0, bestChain: 15, dayKey: '2026-10-01' };
  const d4 = Meta.evaluateMissions(d3, r4);
  assert.equal(d4.chain15, '2026-10-01', '15-chain completes chain15');
  assert.deepEqual(d3, Meta.evaluateMissions(d3, r3), 'evaluate is pure');
});
