'use strict';
/* Color Panic — S3 alt modes: Sudden Death + Marathon (node:test, zero deps).
 * Run: node --test games/color-panic/modes.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const core = require(path.join(__dirname, 'core.js'));
const { createGame } = core;

function makeGame(overrides) {
  const opts = Object.assign({ random: function () { return 0; } }, overrides || {});
  return createGame(opts);
}

/** random() -> 0.99: never a Stroop conflict, so every target window is
 *  exactly timerFor(score, floor) with no CONFUSION_BONUS mixed in. */
const plain = () => 0.99;

function hitCorrect(g) {
  return g.pressSlot(g.getState().targetIndex);
}

// ---- mode is exposed, per instance ----

test('mode is exposed in getState and defaults to classic', () => {
  assert.strictEqual(makeGame().getState().mode, 'classic');
  assert.strictEqual(makeGame({ mode: 'sudden' }).getState().mode, 'sudden');
  assert.strictEqual(makeGame({ mode: 'marathon' }).getState().mode, 'marathon');
  // anything unrecognized plays classic
  assert.strictEqual(makeGame({ mode: 'easy' }).getState().mode, 'classic');
});

test('modes are per-instance and do not leak between games', () => {
  const a = createGame({ mode: 'marathon', random: plain });
  const b = createGame({ random: plain });
  a.start();
  b.start();
  assert.strictEqual(a.getState().mode, 'marathon');
  assert.strictEqual(b.getState().mode, 'classic');
  assert.strictEqual(a.getState().roundTimeLeft, 60);
  assert.strictEqual(b.getState().roundTimeLeft, 30);
});

// ---- Sudden Death: one heart, first miss of any kind ends ----

test('sudden: single heart shown as maxHearts 1', () => {
  const g = makeGame({ mode: 'sudden', random: plain });
  g.start();
  const s = g.getState();
  assert.strictEqual(s.maxHearts, 1);
  assert.strictEqual(s.hearts, 1);
});

test('sudden: first wrong press ends the round with score intact', () => {
  const g = makeGame({ mode: 'sudden', random: plain });
  g.start();
  assert.strictEqual(hitCorrect(g).hit, true);
  g.update(0.2); // clear lockout
  assert.strictEqual(hitCorrect(g).hit, true);
  g.update(0.2);
  const scoreSoFar = g.getState().score;
  assert.ok(scoreSoFar > 0, 'setup: player actually scored');
  const t = g.getState().targetIndex;
  const r = g.pressSlot((t + 1) % 4);
  assert.strictEqual(r.hit, false);
  const s = g.getState();
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.hearts, 0);
  assert.strictEqual(s.score, scoreSoFar, 'score must survive the ending miss');
  // a round that is over takes no further input
  assert.strictEqual(g.pressSlot(t).ignored, true);
});

test('sudden: first target expiry also ends the round', () => {
  const g = makeGame({ mode: 'sudden', random: plain });
  g.start();
  const total = g.getState().targetTimeTotal;
  g.update(total + 0.05);
  const s = g.getState();
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.hearts, 0);
  assert.strictEqual(s.roundTimeLeft > 0, true, 'round timer was not the cause');
});

test('sudden: restart grants a fresh single heart', () => {
  const g = makeGame({ mode: 'sudden', random: plain });
  g.start();
  g.pressSlot((g.getState().targetIndex + 1) % 4);
  assert.strictEqual(g.getState().phase, 'over');
  g.start();
  const s = g.getState();
  assert.strictEqual(s.phase, 'playing');
  assert.strictEqual(s.hearts, 1);
  assert.strictEqual(s.maxHearts, 1);
  assert.strictEqual(s.score, 0);
});

// ---- Marathon: 60s round + mode-aware floor ----

test('marathon: round timer starts at 60 and resets to 60 on restart', () => {
  const g = makeGame({ mode: 'marathon', random: plain });
  assert.strictEqual(g.getState().roundTimeLeft, 60, 'idle exposes full marathon time');
  g.start();
  assert.strictEqual(g.getState().roundTimeLeft, core.MARATHON_TIME);
  g.update(5);
  assert.ok(g.getState().roundTimeLeft < 60 && g.getState().roundTimeLeft > 54);
  g.start();
  assert.strictEqual(g.getState().roundTimeLeft, 60, 'restart resets to 60');
});

test('marathon: classic round length untouched (30s, 3 hearts)', () => {
  const g = makeGame({ random: plain });
  g.start();
  const s = g.getState();
  assert.strictEqual(s.roundTimeLeft, core.ROUND_TIME);
  assert.strictEqual(s.maxHearts, 3);
});

test('marathon: window floor relaxes to 0.85 after 10 correct', () => {
  const g = makeGame({ mode: 'marathon', random: plain });
  g.start();
  let guard = 0;
  while (g.getState().correctCount < 10 && guard++ < 50) {
    hitCorrect(g);
    g.update(0.2);
  }
  assert.strictEqual(g.getState().correctCount, 10);
  // The ramp (score-driven) still sits above 0.85 here; drive a few more
  // correct answers until the score ramp is fully below the relaxed floor,
  // then the floor value must be observable exactly.
  while (g.getState().correctCount < 17 && guard++ < 100) {
    hitCorrect(g);
    g.update(0.2);
  }
  const w = g.getState().targetTimeTotal;
  assert.ok(Math.abs(w - 0.85) < 1e-9,
    'floor after 10-correct band must be 0.85, got ' + w);
});

test('marathon: window floor 0.80 after 20 correct', () => {
  const g = makeGame({ mode: 'marathon', random: plain });
  g.start();
  let guard = 0;
  while (g.getState().correctCount < 21 && guard++ < 100) {
    hitCorrect(g);
    g.update(0.2);
  }
  const w = g.getState().targetTimeTotal;
  assert.ok(Math.abs(w - 0.80) < 1e-9,
    'floor after 20-correct band must be 0.80, got ' + w);
});

test('marathon: window floor clamps at 0.5 and stays there', () => {
  const g = makeGame({ mode: 'marathon', random: plain });
  g.start();
  let guard = 0;
  while (g.getState().correctCount < 81 && guard++ < 400) {
    hitCorrect(g);
    g.update(0.2);
  }
  let w = g.getState().targetTimeTotal;
  assert.ok(Math.abs(w - core.MARATHON_FLOOR) < 1e-9,
    'floor must clamp at MARATHON_FLOOR, got ' + w);
  while (g.getState().correctCount < 90 && guard++ < 500) {
    hitCorrect(g);
    g.update(0.2);
  }
  w = g.getState().targetTimeTotal;
  assert.ok(Math.abs(w - core.MARATHON_FLOOR) < 1e-9,
    'floor must stay clamped past 80 correct, got ' + w);
  assert.strictEqual(g.getState().phase, 'playing',
    '90 lockout-clearing updates total 18s of simulated time, still inside the 60s round');
});

test('marathon: wrong answers never raise the floor back', () => {
  const g = makeGame({ mode: 'marathon', random: plain });
  g.start();
  let guard = 0;
  while (g.getState().correctCount < 21 && guard++ < 100) {
    hitCorrect(g);
    g.update(0.2);
  }
  assert.ok(Math.abs(g.getState().targetTimeTotal - 0.80) < 1e-9);
  const t = g.getState().targetIndex;
  const r = g.pressSlot((t + 1) % 4); // a miss: combo resets, heart lost
  assert.strictEqual(r.hit, false);
  assert.strictEqual(g.getState().correctCount, 21, 'misses do not count toward the floor');
  g.update(0.2); // clear lockout
  assert.strictEqual(hitCorrect(g).hit, true);
  const w = g.getState().targetTimeTotal;
  assert.ok(Math.abs(w - 0.80) < 1e-9,
    'floor must stay 0.80 after a miss, got ' + w);
});

// ---- classic unchanged ----

test('classic: same sequences as before — 30s, 0.9 floor, 3 hearts', () => {
  const g = makeGame({ random: plain });
  g.start();
  assert.strictEqual(g.getState().roundTimeLeft, 30);
  let guard = 0;
  while (g.getState().correctCount < 25 && guard++ < 100) {
    hitCorrect(g);
    g.update(0.2);
  }
  const s = g.getState();
  assert.ok(s.score > 180, 'setup: score past the ramp minimum');
  assert.ok(Math.abs(s.targetTimeTotal - core.TIMER_MIN) < 1e-9,
    'classic floor must stay TIMER_MIN, got ' + s.targetTimeTotal);
  // deep score must NOT relax the classic floor
  assert.ok(s.targetTimeTotal >= core.TIMER_MIN - 1e-9);
});

test('classic: huge update still ends via the 30s round timer', () => {
  const g = makeGame({ random: plain });
  g.start();
  g.update(1e9);
  const s = g.getState();
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.roundTimeLeft, 0);
});

// ---- constants exported for renderers/tests ----

test('marathon constants are exported from the UMD surface', () => {
  assert.strictEqual(core.MARATHON_TIME, 60);
  assert.strictEqual(core.MARATHON_STEP, 0.05);
  assert.strictEqual(core.MARATHON_FLOOR, 0.5);
});
