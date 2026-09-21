'use strict';
/* Color Panic — round-timer + browser-flow additions (worker-owned).
 * Run: node --test games/color-panic/core.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const core = require(path.join(__dirname, 'core.js'));
const { createGame } = core;

test('round timer: starts at 30 and resets on start/restart', () => {
  const g = makeGame();
  assert.strictEqual(g.getState().roundTimeLeft, 30, 'idle still exposes full round time');
  g.start();
  assert.strictEqual(g.getState().roundTimeLeft, 30);
  g.update(5);
  assert.ok(g.getState().roundTimeLeft < 30 && g.getState().roundTimeLeft > 24);
  g.start();
  assert.strictEqual(g.getState().roundTimeLeft, 30, 'restart resets the round timer');
});

test('round timer decreases only while playing (pause freezes it)', () => {
  const g = makeGame();
  g.start();
  g.update(4);
  const mid = g.getState().roundTimeLeft;
  g.pause();
  g.update(10);
  assert.strictEqual(g.getState().roundTimeLeft, mid, 'frozen while paused');
  g.resume();
  g.update(1);
  assert.ok(g.getState().roundTimeLeft < mid);
});

test('round expiry ends the round even for a perfect player with hearts left', () => {
  const g = makeGame();
  g.start();
  let guards = 0;
  while (g.getState().phase === 'playing' && guards++ < 10000) {
    g.pressSlot(g.getState().targetIndex);
    g.update(0.1);
  }
  assert.strictEqual(g.getState().phase, 'over');
  assert.ok(g.getState().hearts > 0, 'no hearts lost');
  assert.ok(g.getState().score > 0, 'player actually scored');
  assert.strictEqual(g.getState().roundTimeLeft, 0);
});

test('round expiry wins the race against per-target expiry in the same tick', () => {
  const g = makeGame();
  g.start();
  g.pressSlot(g.getState().targetIndex); // fresh 2.5s target timer, hearts intact
  g.update(0.18);                        // clear press lockout
  g.update(29.9);                        // crosses the 30s round boundary
  const s = g.getState();
  assert.strictEqual(s.phase, 'over');
  assert.ok(Math.abs(s.roundTimeLeft) < 0.01, 'round timer fully drained, got ' + s.roundTimeLeft);
  assert.strictEqual(s.hearts, 3, 'round end must not also charge a target expiry');
});

function makeGame(overrides) {
  return createGame(Object.assign({ random: function () { return 0; } }, overrides || {}));
}
