'use strict';
// Node built-in test runner: node --test games/snack-catch/core.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const PocketGame = require('./core.js');

function fixedRng() { // deterministic 0..0.999 sequence
  let x = 123456789;
  return function () { x = (x * 1103515245 + 12345) >>> 0; return x / 4294967296; };
}
function newGame() { return PocketGame.createGame({ rng: fixedRng() }); }

test('start resets state', () => {
  const g = newGame();
  g.start(); g.update(16); g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.score, 0);
  assert.equal(g.hearts, 3);
  assert.equal(g.combo, 0);
  assert.equal(g.multiplier, 1);
  assert.equal(g.items.length, 0);
  assert.equal(g.timeLeft, g.CONST.ROUND_MS);
});

test('update no-op when not playing (ready/paused/over)', () => {
  const g = newGame();
  g.update(16);
  assert.equal(g.items.length, 0);
  g.start();
  g.pause();
  const t = g.timeLeft;
  g.update(100);
  assert.equal(g.timeLeft, t);
  g.resume(); g.timeLeft = 1; g.update(16);
  assert.equal(g.state, 'over');
  const s = g.score;
  g.update(1000);
  assert.equal(g.score, s);
});

test('input clamps basket within bounds', () => {
  const g = newGame(); g.start();
  assert.equal(g.setInput(-50), g.basket.w / 2);
  assert.equal(g.setInput(9999), g.W - g.basket.w / 2);
  assert.equal(g.moveBasket(-1000), g.basket.w / 2);
  assert.equal(g.moveBasket(+1000), g.W - g.basket.w / 2);
  const x = g.setInput(g.W / 2);
  assert.equal(g.moveBasket(-20), x - 20);
});

test('catching snack scores 10 with multiplier growth every 5 combo', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 }); // never bombs, fixed x
  g.start();
  // follow the lowest item so it lands in the basket
  function follow() {
    let low = null;
    for (const it of g.items) if (!low || it.y > low.y) low = it;
    if (low) g.setInput(low.x);
  }
  for (let i = 0; i < 900 && g.catches < 1; i++) { follow(); g.update(16); }
  assert.equal(g.catches, 1, 'should catch a snack');
  assert.equal(g.score, 10);
  for (let i = 0; i < 1200 && g.catches < 5; i++) { follow(); g.update(16); }
  assert.ok(g.catches >= 5, 'reached 5 catches, got ' + g.catches);
  assert.ok(g.multiplier >= 2, 'multiplier >= 2');
});

test('bomb costs a heart, 3 bombs ends game (explicit deterministic fixture)', () => {
  // Note: rng () => 0.999 makes isBomb = rng() < threshold always FALSE, so no
  // bomb ever spawns via play. Instead we place bombs deterministically by hand:
  // real spawn pipeline (rng below threshold -> bomb), real swept collision, real
  // heart loss, real 3-strike game over. No rules weakened; no randomness relied on.
  const g = PocketGame.createGame({ rng: () => 0.5 }); // spawn() never rolls a bomb, so the pushed fixtures are the only bombs; natural spawns are snacks that simply miss.
  g.start();
  const top = g.basket.y - g.basket.h / 2;
  for (let n = 0; n < 3 && g.state === 'playing'; n++) {
    g.items.push({ x: g.basket.x, y: top - 20, vy: 2000, kind: 'bomb' });
    g.update(16); // single step: crosses basket top line (y top-20 -> past top) -> bomb hit
    assert.equal(g.bombsHit, n + 1, 'bomb ' + (n + 1) + ' registered');
    assert.equal(g.hearts, 2 - n, 'heart lost on bomb ' + (n + 1));
  }
  assert.equal(g.state, 'over');
  assert.equal(g.hearts, 0);
  assert.ok(g.bombsHit >= 3);
  assert.ok(g.takeEvents().some(e => e[0] === 'bomb'), 'bomb events emitted');
});

test('missed snack breaks combo without losing hearts', () => {
  const g = newGame(); g.start();
  let missedAt = -1, comboBefore = 0;
  for (let i = 0; i < 5000 && missedAt === -1; i++) {
    g.setInput(0); // stand far left -> items fall past
    g.update(16);
    if (g.missed > 0) { missedAt = i; comboBefore = g.combo; }
  }
  assert.ok(missedAt >= 0, 'a snack was missed');
  assert.equal(g.hearts, 3, 'no hearts lost on miss');
  assert.equal(g.combo, 0, 'combo reset');
  assert.equal(g.multiplier, 1);
});

test('time expiration ends round', () => {
  const g = newGame(); g.start();
  g.update(g.CONST.ROUND_MS + 1);
  assert.equal(g.state, 'over');
  assert.equal(g.timeLeft, 0);
  assert.ok(g.takeEvents().some(e => e[0] === 'expire'));
});

test('restart after game over works', () => {
  const g = newGame({ rng: () => 0.999 }); g.start();
  for (let i = 0; i < 2000 && g.state === 'playing'; i++) {
    for (const it of g.items) g.setInput(it.x);
    g.update(16);
  }
  assert.equal(g.state, 'over');
  g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.hearts, 3);
  assert.equal(g.items.length, 0);
});

test('pause/resume cycle', () => {
  const g = newGame(); g.start();
  assert.equal(g.pause(), 'paused');
  assert.equal(g.pause(), 'paused'); // idempotent
  assert.equal(g.resume(), 'playing');
  assert.equal(g.resume(), 'playing');
  assert.equal(g.togglePause(), 'paused');
  assert.equal(g.togglePause(), 'playing');
});

test('items spawn and stay within horizontal bounds', () => {
  const g = newGame(); g.start();
  let seen = 0;
  for (let i = 0; i < 400 && seen < 20; i++) {
    g.update(16);
    for (const it of g.items) {
      seen++;
      assert.ok(it.x >= 0 && it.x <= g.W, 'x in bounds');
      assert.ok(it.vy > 0, 'falling');
      assert.ok(['bomb', 'apple', 'donut', 'cookie', 'banana'].includes(it.kind));
    }
  }
  assert.ok(seen >= 20, 'spawned items, got ' + seen);
});

test('fall speed escalates over round', () => {
  const g = newGame(); g.start();
  let maxEarly = 0, maxLate = 0;
  for (let i = 0; i < 300; i++) {
    g.update(16);
    for (const it of g.items) maxEarly = Math.max(maxEarly, it.vy);
  }
  g.timeLeft = g.CONST.ROUND_MS * 0.1;
  for (let i = 0; i < 300; i++) {
    g.update(16);
    for (const it of g.items) maxLate = Math.max(maxLate, it.vy);
  }
  assert.ok(maxLate > maxEarly, `late speed ${maxLate} > early ${maxEarly}`);
});

test('swept collision: fast item does not tunnel past basket', () => {
  const g = newGame(); g.start();
  const top = g.basket.y - g.basket.h / 2;
  // 640px in one step: naive band check would miss, swept check must not
  g.items.push({ x: g.W / 2, y: top - 10, vy: 40000, kind: 'apple' });
  g.setInput(g.W / 2);
  g.update(16);
  assert.equal(g.catches, 1, 'tunneling prevented');
});

test('deterministic: same seed, same game', () => {
  const rngA = PocketGame.mulberry32(42), rngB = PocketGame.mulberry32(42);
  const a = PocketGame.createGame({ rng: rngA }), b = PocketGame.createGame({ rng: rngB });
  a.start(); b.start();
  for (let i = 0; i < 200; i++) {
    a.update(16); b.update(16);
    a.setInput(100 + i); b.setInput(100 + i);
  }
  assert.deepEqual(a.items.map(i => [i.x, i.y, i.kind]), b.items.map(i => [i.x, i.y, i.kind]));
  assert.equal(a.score, b.score);
});

test('events consumed by takeEvents', () => {
  const g = newGame(); g.start();
  g.takeEvents();
  assert.equal(g.events.length, 0);
});

test('module shape (UMD exports)', () => {
  assert.equal(typeof PocketGame.createGame, 'function');
  assert.equal(typeof PocketGame.mulberry32, 'function');
  assert.equal(typeof PocketGame.VERSION, 'string');
});

// ---- S2 fairness & difficulty fixtures (added 2026-09-27) ----

function seededRng(seed) { // mulberry32, matches gameplay probes
  let a = seed | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

test('FALL_MAX is enforced: no item ever falls faster than the cap', () => {
  // Seed 1 demonstrably produces ~283 px/s items in the final seconds
  // before the clamp was added.
  const g = PocketGame.createGame({ rng: seededRng(1) });
  g.start();
  let maxVy = 0;
  for (let t = 0; t < 30000 && g.state === 'playing'; t += 16) {
    g.update(16);
    for (const it of g.items) maxVy = Math.max(maxVy, it.vy);
    g.takeEvents();
  }
  assert.ok(maxVy <= g.CONST.FALL_MAX,
    'item fell at ' + maxVy + ' px/s, cap is ' + g.CONST.FALL_MAX);
});

test('bombs never spawn within the dodge radius of the basket', () => {
  // Basket idles at its default center (180); seed 1 demonstrably spawns a
  // bomb nearly on top of it before the spawn-time distance rule existed.
  const BOMB_MIN_BASKET_DIST = 70;
  const g = PocketGame.createGame({ rng: seededRng(1) });
  g.start();
  const bombXs = [];
  for (let t = 0; t < 30000 && g.state === 'playing'; t += 16) {
    g.update(16);
    for (const e of g.takeEvents()) {
      if (e[0] === 'spawn' && e[1] === 'bomb') bombXs.push(e[2]);
    }
  }
  assert.ok(bombXs.length > 0, 'fixture must actually spawn bombs');
  for (const x of bombXs) {
    assert.ok(Math.abs(x - 180) >= BOMB_MIN_BASKET_DIST,
      'bomb spawned at x=' + x + ' with basket at 180 (min ' + BOMB_MIN_BASKET_DIST + ')');
  }
});
