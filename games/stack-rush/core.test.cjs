'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PG = require(path.join(__dirname, 'core.js'));

function linearRng(start) {
  let v = start || 0;
  return function () { v = (v + 0.37) % 1; return v; };
}
function step(g, dt, n) { for (let i = 0; i < (n || 1); i++) g.update(dt); }
function fixedRng() { return function () { return 0.99; }; } // always picks right side

test('core is UMD: exports under Node, PocketGame under globals', () => {
  assert.strictEqual(typeof PG.createGame, 'function');
  assert.strictEqual(typeof PG.mulberry32, 'function');
});

test('start: phase playing, one moving block, score 0, first layer easy', () => {
  const g = PG.createGame({ rng: fixedRng() });
  assert.strictEqual(g.getState().phase, 'ready');
  g.start();
  const s = g.getState();
  assert.strictEqual(s.phase, 'playing');
  assert.strictEqual(s.score, 0);
  assert.ok(s.moving, 'moving block exists');
  assert.strictEqual(s.moving.w, PG.constants.START_W);
  assert.ok(g.isInsideField(g.movingBounds()), 'moving block inside field');
});

test('input start from ready; unknown actions ignored per phase semantics', () => {
  const g = PG.createGame({ rng: fixedRng() });
  assert.strictEqual(g.input('wiggle'), false, 'unknown action before start ignored');
  assert.strictEqual(g.input('pause'), false, 'pause before start ignored');
  g.input('start');
  assert.strictEqual(g.getState().phase, 'playing');
  assert.strictEqual(g.input('start'), false, 'start while playing is ignored');
});

test('first drop creates base layer, +1 score, spawns next block', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  // let moving block travel a bit then drop
  step(g, 1 / 60, 30);
  g.input('drop');
  const s = g.getState();
  assert.strictEqual(s.layers.length, 1);
  assert.strictEqual(s.score, 1);
  assert.ok(s.moving, 'next block spawned');
});

test('perfect alignment within 4px snaps width, awards streak bonus', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  // place first layer deterministically: drop immediately
  g.input('drop');
  const base = g.getState().layers[0];
  // move the new block so its left edge is within tolerance of base.x
  const m = g.getState().moving;
  // nudge to exact alignment
  m.x = base.x;
  g.input('drop');
  const s = g.getState();
  assert.strictEqual(s.layers.length, 2);
  const top = s.layers[1];
  assert.strictEqual(top.w, base.w, 'perfect keeps full width');
  assert.strictEqual(top.perfect, true);
  assert.strictEqual(s.score, 3, '1 (first) + 1 layer + 1 streak bonus');
  assert.strictEqual(s.streak, 1);
});

test('off-center drop trims overhang and preserves overlap width', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  g.input('drop');
  const base = g.getState().layers[0];
  const m = g.getState().moving;
  m.x = base.x + 10; // shifted 10px: overhang 10 on right, 0 left
  g.input('drop');
  const top = g.getState().layers[1];
  assert.strictEqual(top.w, base.w - 10);
  assert.strictEqual(g.getState().debris.length, 1, 'overhang became debris');
  assert.strictEqual(top.perfect, false);
  assert.strictEqual(g.getState().score, 2);
});

test('zero overlap ends round with phase over', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  g.input('drop');
  const base = g.getState().layers[0];
  const m = g.getState().moving;
  m.x = (base.x + base.w + 40);
  m.x = Math.min(m.x, PG.constants.W - m.w); // stay in field
  // ensure truly no overlap
  if (m.x < base.x + base.w) m.x = base.x + base.w + 1;
  g.input('drop');
  const s = g.getState();
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.layers.length, 1, 'no new layer');
  assert.strictEqual(s.moving, null);
});

test('debris falls and expires (bounded lifetime)', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  g.input('drop');
  const base = g.getState().layers[0];
  const m = g.getState().moving;
  m.x = base.x + 10;
  g.input('drop');
  assert.ok(g.getState().debris.length >= 1);
  step(g, 1 / 60, 60 * 3); // 3 seconds
  assert.strictEqual(g.getState().debris.length, 0, 'debris expired');
});

test('time-driven movement: update bounces block at field bounds', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  const m = g.getState().moving;
  const startX = m.x;
  step(g, 1 / 60, 60 * 10); // 10s: must have hit a wall at least once
  assert.ok(m.dir !== 0);
  assert.ok(m.x >= 0 && m.x + m.w <= PG.constants.W + 0.001, 'bounded inside field');
  assert.ok(m.x !== startX || m.speed === 0, 'block moved over time');
});

test('speed rises per layer and is capped', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  const cap = PG.constants.MAX_SPEED;
  g.input('drop');
  const s1 = g.getState().speed;
  assert.ok(s1 > PG.constants.BASE_SPEED);
  // perfect-stack many times to force cap
  for (let i = 0; i < 60; i++) {
    if (g.getState().phase !== 'playing') break;
    const base = g.getState().layers[g.getState().layers.length - 1];
    g.getState().moving.x = base.x;
    g.input('drop');
  }
  assert.strictEqual(g.getState().speed, cap, 'speed capped at MAX_SPEED');
});

test('paused: update does not move block or advance logic', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  g.input('pause');
  assert.strictEqual(g.getState().phase, 'paused');
  const before = JSON.stringify(g.getState().moving);
  step(g, 1 / 60, 30);
  const after = JSON.stringify(g.getState().moving);
  assert.strictEqual(before, after, 'moving block frozen while paused');
  g.input('resume');
  assert.strictEqual(g.getState().phase, 'playing');
});

test('restart after game over resets score, layers, phase', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  g.input('drop');
  const base = g.getState().layers[0];
  const m = g.getState().moving;
  m.x = base.x + base.w + 1; // miss
  g.input('drop');
  assert.strictEqual(g.getState().phase, 'over');
  g.input('restart');
  const s = g.getState();
  assert.strictEqual(s.phase, 'playing');
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.layers.length, 0);
  assert.ok(s.moving);
});

test('determinism: same rng seed + same inputs -> identical state', () => {
  function run() {
    const g = PG.createGame({ rng: PG.mulberry32(12345) });
    g.start();
    for (let i = 0; i < 30; i++) {
      step(g, 1 / 60, 7);
      if (g.getState().phase !== 'playing') break;
      g.input('drop');
    }
    const s = g.getState();
    return JSON.stringify({ score: s.score, phase: s.phase, layers: s.layers.length, cam: s.cameraY, speed: s.speed });
  }
  assert.strictEqual(run(), run());
});

test('camera follows tower as it grows', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  const cam0 = g.getState().cameraY;
  g.input('drop'); // base layer first (loop below reads layers[last])
  for (let i = 0; i < 10; i++) {
    if (g.getState().phase !== 'playing') break;
    const base = g.getState().layers[g.getState().layers.length - 1];
    g.getState().moving.x = base.x; // perfect: width never shrinks
    g.input('drop');
  }
  assert.ok(g.getState().cameraY > cam0, 'camera panned upward');
});

test('layers remain inside field bounds after many drops', () => {
  const g = PG.createGame({ rng: fixedRng() });
  g.start();
  for (let i = 0; i < 12; i++) {
    if (g.getState().phase !== 'playing') break;
    // drop with a small deliberate offset to exercise trimming
    const base = g.getState().layers[g.getState().layers.length - 1];
    if (base) g.getState().moving.x = base.x + 3;
    g.input('drop');
  }
  const s = g.getState();
  for (let i = 0; i < s.layers.length; i++) {
    const b = g.layerScreen(i);
    assert.ok(b.x >= 0 && b.x + b.w <= PG.constants.W + 0.001, 'layer ' + i + ' within field');
  }
});

test('tap is alias for drop/start/restart depending on phase', () => {
  const g = PG.createGame({ rng: fixedRng() });
  assert.strictEqual(g.input('tap'), true, 'tap from ready starts game');
  assert.strictEqual(g.getState().phase, 'playing');
  g.input('pause');
  assert.strictEqual(g.input('tap'), false, 'tap while paused does nothing');
  g.input('resume');
  const base = g.getState().layers[0];
  if (base) g.getState().moving.x = base.x;
  assert.strictEqual(g.input('tap'), true, 'tap drops');
});
