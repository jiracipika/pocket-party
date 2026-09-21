'use strict';
/* Color Panic — core logic tests (node:test, zero dependencies).
 * Run: node --test games/color-panic/core.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const core = require(path.join(__dirname, 'core.js'));
const { createGame, COLORS, SLOT_COUNT } = core;

function makeGame(overrides) {
  const opts = Object.assign({ random: function () { return 0; } }, overrides || {});
  return createGame(opts);
}

test('UMD export surface is complete', () => {
  assert.strictEqual(typeof createGame, 'function');
  assert.ok(Array.isArray(COLORS) && COLORS.length === 4);
  assert.strictEqual(SLOT_COUNT, 4);
});

test('start begins a fresh round: score 0, 3 hearts, target set, timer running', () => {
  const g = makeGame();
  g.start();
  const s = g.getState();
  assert.strictEqual(s.phase, 'playing');
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.hearts, 3);
  assert.ok(s.targetIndex >= 0 && s.targetIndex < 4);
  assert.ok(s.targetTimeLeft > 0);
  assert.strictEqual(s.combo, 0);
});

test('correct input scores +10 plus capped combo bonus and advances target', () => {
  const g = makeGame();
  g.start();
  const first = g.getState().targetIndex;
  const r1 = g.pressSlot(first);
  assert.strictEqual(r1.hit, true);
  assert.strictEqual(r1.points, 10); // combo 0 -> no bonus
  assert.strictEqual(g.getState().score, 10);
  // second correct -> combo 1 -> +10 +2 = 12
  g.update(0.2); // clear press lockout
  const second = g.getState().targetIndex;
  assert.notStrictEqual(second, first, 'target must not repeat immediately');
  const r2 = g.pressSlot(second);
  assert.strictEqual(r2.points, 12);
  assert.strictEqual(g.getState().score, 22);
});

test('combo bonus is capped', () => {
  const g = makeGame();
  g.start();
  let prev = -1;
  for (let i = 0; i < 10; i++) {
    const t = g.getState().targetIndex;
    assert.notStrictEqual(t, prev, 'no immediate repeats');
    const r = g.pressSlot(t);
    assert.strictEqual(r.hit, true);
    assert.ok(r.points <= 20, 'bonus capped: got ' + r.points);
    prev = t;
    g.update(0.2); // clear lockout
  }
});

test('wrong input costs a heart, resets combo, advances target', () => {
  const g = makeGame();
  g.start();
  const t = g.getState().targetIndex;
  const wrong = (t + 1) % 4;
  const r = g.pressSlot(wrong);
  assert.strictEqual(r.hit, false);
  const s = g.getState();
  assert.strictEqual(s.hearts, 2);
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.combo, 0);
  assert.notStrictEqual(s.targetIndex, t);
  assert.strictEqual(s.phase, 'playing');
});

test('three wrong inputs end the game', () => {
  const g = makeGame();
  g.start();
  for (let i = 0; i < 3; i++) {
    const t = g.getState().targetIndex;
    g.pressSlot((t + 1) % 4);
    g.update(0.2); // clear lockout
  }
  const s = g.getState();
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.hearts, 0);
});

test('timer expiry costs a heart and advances target', () => {
  const g = makeGame();
  g.start();
  const t = g.getState().targetIndex;
  const total = g.getState().targetTimeTotal;
  g.update(total + 0.05);
  const s = g.getState();
  assert.strictEqual(s.hearts, 2);
  assert.notStrictEqual(s.targetIndex, t);
  assert.strictEqual(s.phase, 'playing');
});

test('per-target timer shrinks with score toward 0.9s minimum', () => {
  const g = makeGame();
  g.start();
  const first = g.getState().targetTimeTotal;
  assert.ok(first >= 2 && first <= 3, 'generous initial timer, got ' + first);
  let hits = 0;
  while (g.getState().phase === 'playing' && hits < 40) {
    g.pressSlot(g.getState().targetIndex);
    g.update(0.2); // clear press lockout
    hits++;
  }
  const late = g.getState().targetTimeTotal;
  assert.ok(late < first, 'timer decreases with score');
  assert.ok(late >= 0.9 - 1e-9, 'timer never below 0.9s, got ' + late);
});

test('time expiration at 0 hearts ends the round (game over)', () => {
  const g = makeGame();
  g.start();
  const total = g.getState().targetTimeTotal;
  for (let i = 0; i < 2; i++) g.update(total + 0.05);
  assert.strictEqual(g.getState().phase, 'playing');
  g.update(total + 0.05);
  assert.strictEqual(g.getState().phase, 'over');
});

test('input is locked after a press (no accidental double input)', () => {
  const g = makeGame();
  g.start();
  const t = g.getState().targetIndex;
  g.pressSlot(t);
  const s = g.getState();
  const r = g.pressSlot((s.targetIndex + 1) % 4); // immediate second press
  assert.strictEqual(r.ignored, true, 'second press within lockout ignored');
  assert.strictEqual(g.getState().hearts, 3, 'no heart lost to double input');
  assert.strictEqual(g.getState().score, 10);
  g.update(0.2); // past lockout
  const t2 = g.getState().targetIndex;
  const r2 = g.pressSlot(t2);
  assert.strictEqual(r2.hit, true, 'input works again after lockout');
});

test('keyPress maps keys 1-4 to slots and ignores others', () => {
  const g = makeGame();
  g.start();
  const t = g.getState().targetIndex;
  assert.strictEqual(g.keyPress(String(t + 1)).hit, true);
  g.update(0.2);
  assert.strictEqual(g.keyPress('9').hit, false);
  assert.strictEqual(g.keyPress('a').hit, false);
});

test('pause freezes timers and input; resume continues', () => {
  const g = makeGame();
  g.start();
  g.pause();
  const before = g.getState().targetTimeLeft;
  g.update(1.5);
  assert.strictEqual(g.getState().phase, 'paused');
  assert.strictEqual(g.getState().targetTimeLeft, before, 'timer frozen while paused');
  const r = g.keyPress('1');
  assert.strictEqual(r.ignored, true, 'no input while paused');
  g.resume();
  assert.strictEqual(g.getState().phase, 'playing');
  g.update(0.05);
  assert.ok(g.getState().targetTimeLeft < before);
});

test('restart resets score, hearts, combo and starts a new round', () => {
  const g = makeGame();
  g.start();
  g.pressSlot(g.getState().targetIndex);
  g.pressSlot((g.getState().targetIndex + 1) % 4);
  const mid = g.getState();
  assert.ok(mid.score > 0 || mid.hearts < 3);
  g.start(); // restart
  const s = g.getState();
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.hearts, 3);
  assert.strictEqual(s.combo, 0);
  assert.strictEqual(s.phase, 'playing');
});

test('deterministic: same seed -> same target sequence', () => {
  function seq() {
    let seed = 42;
    const rng = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const g = createGame({ random: rng });
    g.start();
    const out = [];
    for (let i = 0; i < 8; i++) {
      out.push(g.getState().targetIndex);
      g.pressSlot(g.getState().targetIndex);
      g.update(0.15); // clear lockout
    }
    return out.join(',');
  }
  assert.strictEqual(seq(), seq());
});

test('injected RNG is actually used for target selection', () => {
  let calls = 0;
  const g = createGame({ random: function () { calls++; return 0.99; } });
  g.start();
  assert.ok(calls > 0, 'core must not use Math.random or Date');
});

test('no repeated target while a round is in progress', () => {
  const g = makeGame();
  g.start();
  let prev = g.getState().targetIndex;
  for (let i = 0; i < 20 && g.getState().phase === 'playing'; i++) {
    g.pressSlot(g.getState().targetIndex);
    g.update(0.2);
    const t = g.getState().targetIndex;
    assert.notStrictEqual(t, prev);
    prev = t;
  }
});

test('bounds: out-of-range slots are rejected safely', () => {
  const g = makeGame();
  g.start();
  const s0 = g.getState();
  assert.strictEqual(g.pressSlot(-1).ignored, true);
  assert.strictEqual(g.pressSlot(4).ignored, true);
  assert.strictEqual(g.keyPress('0').ignored, true);
  const s1 = g.getState();
  assert.strictEqual(s0.hearts, s1.hearts);
  assert.strictEqual(s0.targetIndex, s1.targetIndex);
  assert.strictEqual(s0.score, s1.score);
});

test('update with huge/negative dt is safe; no NaN state', () => {
  const g = makeGame();
  g.start();
  g.update(1e9);
  assert.strictEqual(g.getState().phase, 'over');
  g.start();
  g.update(-5);
  const s = g.getState();
  assert.ok(isFinite(s.targetTimeLeft) && s.targetTimeLeft > 0);
});

test('core has no DOM/window/Date/Math.random dependencies (source scan)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8');
  assert.ok(!/document|window\b|Date\b|Math\.random|requestAnimationFrame/.test(src),
    'core must stay pure/deterministic');
});
