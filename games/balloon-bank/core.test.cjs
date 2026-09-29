'use strict';
// Node built-in test runner: node --test games/balloon-bank/core.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const PocketGame = require('./core.js');

const STEP = 16; // ms per simulated frame

function fixedRng() { // deterministic 0..0.999 sequence
  let x = 123456789;
  return function () { x = (x * 1103515245 + 12345) >>> 0; return x / 4294967296; };
}
function newGame() { return PocketGame.createGame({ rng: fixedRng() }); }
function seededRng(seed) { // mulberry32, matches gameplay probes
  let a = seed | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

test('start resets state', () => {
  const g = newGame();
  g.start(); g.setHold(true); g.update(500); g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.score, 0);
  assert.equal(g.hearts, 3);
  assert.equal(g.chain, 0);
  assert.equal(g.radius, g.CONST.R_MIN);
  assert.equal(g.timeLeft, g.CONST.ROUND_MS);
  assert.equal(g.banks, 0);
  assert.equal(g.pops, 0);
  assert.equal(g.held, false);
});

test('hold grows the balloon at PUMP_RATE', () => {
  const g = newGame(); g.start();
  g.setHold(true);
  const r0 = g.radius;
  g.update(STEP);
  assert.ok(Math.abs(g.radius - (r0 + g.CONST.PUMP_RATE * STEP / 1000)) < 1e-9,
    'radius grows by PUMP_RATE*dt');
});

test('idle balloon leaks at LEAK_RATE and floors at R_MIN', () => {
  const g = newGame(); g.start();
  g.setHold(true);
  for (let i = 0; i < 30; i++) g.update(STEP); // grow well above R_MIN
  g.setHold(false);
  const r0 = g.radius;
  g.update(STEP);
  assert.ok(Math.abs(g.radius - (r0 - g.CONST.LEAK_RATE * STEP / 1000)) < 1e-9,
    'radius decays by LEAK_RATE*dt');
  for (let i = 0; i < 600; i++) g.update(STEP);
  assert.equal(g.radius, g.CONST.R_MIN, 'leak stops at the fresh-balloon size');
});

test('pumping past the threshold pops: heart, chain reset, respawn', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 }); // threshold pinned at midrange
  g.start();
  g.setHold(true);
  for (let i = 0; i < 400 && g.state === 'playing'; i++) g.update(STEP);
  assert.ok(g.pops >= 1, 'balloon popped past its threshold');
  assert.equal(g.hearts, g.CONST.HEARTS - g.pops, 'each pop costs one heart');
  assert.equal(g.chain, 0, 'a pop resets the chain');
  assert.equal(g.respawnMs > 0 || g.state === 'over', true, 'balloon respawns (or run over)');
});

test('three pops end the run', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  for (let i = 0; i < 3000 && g.state === 'playing'; i++) { g.setHold(true); g.update(STEP); }
  assert.equal(g.state, 'over');
  assert.equal(g.hearts, 0);
  assert.equal(g.pops, 3);
});

test('bank pays quadratic points, resets the balloon, re-rolls the threshold', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  const t0 = g.threshold;
  g.setHold(true);
  g.update(1000); // 1s of pumping: radius = R_MIN + 85
  const bankedAt = g.radius;
  const pts = g.bank();
  assert.equal(pts, PocketGame.bankPointsFor(bankedAt), 'payout matches the quadratic table');
  assert.equal(g.radius, g.CONST.R_MIN, 'banked balloon respawns fresh');
  assert.ok(g.threshold >= g.CONST.THRESHOLD_MIN && g.threshold <= g.CONST.THRESHOLD_MAX,
    'fresh threshold within range');
  assert.equal(g.score, pts);
  assert.ok(g.takeEvents().some(e => e[0] === 'bank' && e[1] === pts), 'bank event with points');
  assert.equal(g.threshold, t0, 'pinned rng re-rolls to the same valid threshold');
});

test('bank chain tiers: x2 from the 3rd bank, x3 from the 6th', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  const payouts = [];
  for (let i = 1; i <= 6; i++) {
    g.setHold(true);
    g.update(500); // identical size each time
    payouts.push(g.bank());
  }
  assert.equal(g.bestChain, 6);
  assert.ok(payouts[2] === payouts[1] * 2, '3rd consecutive bank pays x2 vs the 2nd');
  assert.ok(payouts[5] === payouts[4] * 1.5, '6th consecutive bank pays x3 vs the 5th');
});

test('a pop resets the chain but bestChain survives', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  for (let i = 0; i < 4; i++) { g.setHold(true); g.update(300); g.bank(); }
  assert.equal(g.chain, 4);
  g.setHold(true);
  for (let i = 0; i < 400 && g.pops === 0; i++) { g.update(STEP); }
  assert.ok(g.pops === 1, 'balloon popped');
  assert.equal(g.chain, 0);
  assert.equal(g.bestChain, 4);
});

test('respawn window blocks pumping', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  g.setHold(true);
  for (let i = 0; i < 400 && g.pops === 0; i++) g.update(STEP);
  assert.equal(g.pops, 1);
  assert.ok(g.respawnMs > 0 || g.radius === 0, 'respawning');
  const duringRespawn = g.radius;
  g.update(STEP);
  if (g.respawnMs > 0) {
    assert.equal(g.radius, duringRespawn, 'no growth while respawning');
  }
});

test('round expiry ends the run at 30s', () => {
  const g = newGame(); g.start();
  for (let t = 0; t < 31000 && g.state === 'playing'; t += STEP) g.update(STEP);
  assert.equal(g.state, 'over');
  assert.equal(g.timeLeft, 0);
});

test('no decay, pops or pumps while paused', () => {
  const g = newGame(); g.start();
  g.setHold(true); g.update(200);
  g.pause();
  assert.equal(g.state, 'paused');
  const r = g.radius, t = g.timeLeft;
  for (let i = 0; i < 30; i++) g.update(STEP);
  assert.equal(g.radius, r);
  assert.equal(g.timeLeft, t);
  g.resume();
  assert.equal(g.state, 'playing');
});

test('invalid dt is a no-op', () => {
  const g = newGame(); g.start();
  g.setHold(true);
  const r = g.radius, t = g.timeLeft;
  g.update(0); g.update(-5); g.update(NaN); g.update(Infinity);
  assert.equal(g.radius, r);
  assert.equal(g.timeLeft, t);
});

test('warning contract: creak engages >= 250ms before the earliest pop', () => {
  const g = PocketGame.createGame({ rng: seededRng(7) });
  g.start();
  g.setHold(true);
  let creakAtMs = -1, popAtMs = -1, elapsed = 0;
  for (let i = 0; i < 2000 && popAtMs < 0 && g.state === 'playing'; i++) {
    const wasCreaking = g.creaking;
    g.update(STEP);
    elapsed += STEP;
    if (creakAtMs < 0 && !wasCreaking && g.creaking) creakAtMs = elapsed;
    if (g.pops > 0) popAtMs = elapsed;
  }
  assert.ok(popAtMs > 0, 'fixture must reach a pop');
  assert.ok(creakAtMs > 0, 'creak must engage before the pop');
  const lead = popAtMs - creakAtMs;
  assert.ok(lead >= g.CONST.CREAK_LEAD_S * 1000 - STEP,
    'creak lead was ' + lead + 'ms, needs >= 250ms (tick tolerance ' + STEP + 'ms)');
});

test('deterministic: same seed, same inputs, same run', () => {
  function play(seed) {
    const g = PocketGame.createGame({ rng: seededRng(seed) });
    g.start();
    let banks = 0;
    for (let i = 0; i < 1500 && g.state === 'playing'; i++) {
      g.setHold(i % 53 < 40); // long pump phases push past the pop threshold
      if (i % 53 === 0 && g.radius > g.CONST.R_MIN + 20) { g.bank(); banks++; }
      g.update(STEP);
    }
    return { score: g.score, banks, pops: g.pops, bestChain: g.bestChain,
      hearts: g.hearts, x: Math.round(g.radius * 1000) };
  }
  assert.deepEqual(play(42), play(42), 'same seed -> identical run');
  assert.notDeepEqual(play(42), play(43), 'different seed -> different run');
});

test('events consumed by takeEvents', () => {
  const g = newGame(); g.start();
  g.takeEvents(); // drop the start event
  g.setHold(true); g.update(300); g.bank();
  const events = g.takeEvents();
  assert.ok(events.some(e => e[0] === 'bank'));
  assert.equal(g.takeEvents().length, 0, 'queue drained');
});

test('module shape (UMD exports)', () => {
  for (const key of ['createGame', 'mulberry32', 'clamp', 'chainMultFor', 'bankPointsFor', 'VERSION']) {
    assert.ok(PocketGame[key] !== undefined, 'exports ' + key);
  }
  const g = PocketGame.createGame({ rng: fixedRng() });
  for (const key of ['update', 'bank', 'setHold', 'start', 'pause', 'resume', 'togglePause', 'endRun', 'takeEvents', 'CONST']) {
    assert.ok(g[key] !== undefined, 'game exposes ' + key);
  }
  assert.equal(PocketGame.chainMultFor(0), 1);
  assert.equal(PocketGame.chainMultFor(3), 2);
  assert.equal(PocketGame.chainMultFor(6), 3);
  assert.equal(PocketGame.bankPointsFor(0), 0);
  assert.equal(PocketGame.bankPointsFor(PocketGame.createGame({ rng: fixedRng() }).CONST.R_MAX), 100);
});
