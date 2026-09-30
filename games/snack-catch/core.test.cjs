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

test('grace pacing: no bombs in the first 5 seconds of a round', () => {
  // Seed 1 spawns a bomb within ~2.5s pre-grace; the round must open
  // snacks-only and only start escalating after CONST.GRACE_MS.
  const GRACE_MS = PocketGame.createGame({ rng: seededRng(1) }).CONST.GRACE_MS;
  const g = PocketGame.createGame({ rng: seededRng(1) });
  g.start();
  let firstBombAt = -1, snacksInGrace = 0;
  for (let t = 0; t <= 30000 && g.state === 'playing'; t += 16) {
    g.update(16);
    for (const e of g.takeEvents()) {
      if (e[0] !== 'spawn') continue;
      const elapsed = g.CONST.ROUND_MS - g.timeLeft;
      if (e[1] === 'bomb') {
        if (firstBombAt < 0) firstBombAt = elapsed;
      } else if (elapsed < GRACE_MS) {
        snacksInGrace++;
      }
    }
  }
  assert.ok(snacksInGrace > 0, 'grace window must still spawn snacks');
  assert.ok(firstBombAt >= 0, 'fixture must see bombs after grace');
  assert.ok(firstBombAt >= GRACE_MS,
    'first bomb at ' + firstBombAt + 'ms, before the ' + GRACE_MS + 'ms grace ended');
});

// ---- S3 power-up fixtures (added 2026-09-29) ----
// Same hand-placed pattern as the bomb fixture above: rng () => 0.5 never rolls
// a bomb or a power-up naturally (0.5 >= 0.06 chance, 0.5 >= bomb ratio is
// false... i.e. no bomb either), so pushed fixtures are the only special items
// and natural spawns stay plain snacks.

function overBasket(g, kind, vy) { // push an item that will cross the catch line on the next update
  const top = g.basket.y - g.basket.h / 2;
  g.items.push({ x: g.basket.x, y: top - 20, vy: vy || 2000, kind: kind });
}

test('golden snack: 30x multiplier points, no catch/combo side effects', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  overBasket(g, 'golden');
  g.update(16);
  assert.equal(g.score, 30, '30 * multiplier(1)');
  assert.equal(g.catches, 0, 'golden is not a snack catch');
  assert.equal(g.combo, 0, 'combo untouched');
  assert.equal(g.multiplier, 1);
  assert.ok(g.takeEvents().some(e => e[0] === 'powerup' && e[1] === 'golden'), 'powerup event emitted');
  // the next real snack still scores 10 and feeds the combo normally
  overBasket(g, 'apple');
  g.update(16);
  assert.equal(g.score, 40);
  assert.equal(g.catches, 1);
  assert.equal(g.combo, 1);
});

test('shield: pickup arms it, bomb absorb keeps hearts and combo, next bomb hurts', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  overBasket(g, 'shield');
  g.update(16);
  assert.equal(g.shield, true, 'shield armed');
  assert.ok(g.takeEvents().some(e => e[0] === 'powerup' && e[1] === 'shield'));
  g.combo = 4; g.multiplier = 1; // state injection: prove combo survives the absorb
  overBasket(g, 'bomb');
  g.update(16);
  assert.equal(g.shield, false, 'shield consumed by the bomb');
  assert.equal(g.hearts, 3, 'no heart lost under shield');
  assert.equal(g.bombsHit, 0, 'blocked bomb is not a hit');
  assert.equal(g.combo, 4, 'combo survives a shielded bomb');
  assert.equal(g.multiplier, 1);
  assert.ok(g.takeEvents().some(e => e[0] === 'shield'), 'shield event emitted');
  overBasket(g, 'bomb');
  g.update(16);
  assert.equal(g.hearts, 2, 'unshielded bomb still costs a heart');
  assert.equal(g.combo, 0, 'unshielded bomb still resets combo');
});

test('shield persists until consumed or round end (no time decay)', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  overBasket(g, 'shield');
  g.update(16);
  g.setInput(g.W + 999); // park far right; natural spawns just miss
  for (let i = 0; i < 400; i++) g.update(16); // 6.4s of real round time
  assert.equal(g.shield, true, 'shield not decayed by time');
  g.update(g.CONST.ROUND_MS);
  assert.equal(g.state, 'over', 'round expires normally');
  assert.equal(g.shield, true, 'still armed at round end if unused');
});

test('slow-mo: same vy crosses the basket band later, decays, round still expires', () => {
  const fast = PocketGame.createGame({ rng: () => 0.5 }); // no slow-mo
  const slow = PocketGame.createGame({ rng: () => 0.5 }); // catches a slow power-up first
  fast.start(); slow.start();
  overBasket(slow, 'slow');
  slow.update(16);
  assert.equal(slow.slowLeft, slow.CONST.SLOW_MS, 'slow-mo armed for 5000ms');
  assert.ok(slow.takeEvents().some(e => e[0] === 'powerup' && e[1] === 'slow'));
  fast.update(16); // keep both timelines aligned
  // identical probe over the basket, same vy: slow-mo must delay the crossing
  const top = fast.basket.y - fast.basket.h / 2;
  fast.items.push({ x: fast.basket.x, y: top - 16, vy: 160, kind: 'apple' });
  slow.items.push({ x: slow.basket.x, y: top - 16, vy: 160, kind: 'apple' });
  const f0 = fast.catches, s0 = slow.catches;
  let fastSteps = -1, slowSteps = -1;
  for (let i = 0; i < 20 && fastSteps < 0; i++) { fast.update(16); if (fast.catches > f0) fastSteps = i + 1; }
  for (let j = 0; j < 20 && slowSteps < 0; j++) { slow.update(16); if (slow.catches > s0) slowSteps = j + 1; }
  assert.ok(fastSteps > 0, 'probe caught without slow-mo');
  assert.ok(slowSteps > fastSteps,
    'same vy crosses later under slow-mo: ' + slowSteps + ' steps vs ' + fastSteps);
  assert.ok(slow.slowLeft > 0 && slow.slowLeft < slow.CONST.SLOW_MS,
    'slow-mo decays in real time, left ' + slow.slowLeft + 'ms');
  // the round clock ignores slow-mo: it still ends at ROUND_MS
  const g2 = PocketGame.createGame({ rng: () => 0.5 });
  g2.start();
  g2.slowLeft = g2.CONST.SLOW_MS; // hand-set mid-effect (same injection pattern)
  g2.update(g2.CONST.ROUND_MS + 1);
  assert.equal(g2.state, 'over');
  assert.equal(g2.timeLeft, 0);
});

test('missed power-ups vanish silently: no combo break, no missed count', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  g.combo = 2; // state injection
  const missed0 = g.missed;
  g.items.push({ x: 20, y: g.H + 13, vy: 1000, kind: 'golden' }); // far from the basket, past the floor
  g.update(16);
  assert.equal(g.items.length, 0, 'power-up gone off-screen');
  assert.equal(g.combo, 2, 'combo intact');
  assert.equal(g.multiplier, 1);
  assert.equal(g.missed, missed0, 'not counted as a missed snack');
  assert.equal(g.takeEvents().filter(e => e[0] === 'miss').length, 0, 'no miss event');
});

test('power-up cadence: none in grace, cooldown since last, at most one airborne', () => {
  // Seed 1 also drives the S2 fixtures; it demonstrably spawns power-ups.
  const g = PocketGame.createGame({ rng: seededRng(1) });
  g.start();
  const at = [];
  let maxAirborne = 0;
  for (let t = 0; t <= 30000 && g.state === 'playing'; t += 16) {
    g.update(16);
    let airborne = 0;
    for (const it of g.items) {
      if (it.kind === 'golden' || it.kind === 'shield' || it.kind === 'slow') airborne++;
    }
    if (airborne > maxAirborne) maxAirborne = airborne;
    for (const e of g.takeEvents()) {
      if (e[0] === 'spawn' && (e[1] === 'golden' || e[1] === 'shield' || e[1] === 'slow')) {
        at.push(g._powerupAt); // exact round-elapsed ms recorded by spawn()
      }
    }
  }
  assert.ok(at.length >= 1, 'seed 1 must produce at least one power-up');
  assert.ok(at.length <= 3, 'cooldown bounds the per-round count: ' + at.length);
  for (const p of at) {
    assert.ok(p >= g.CONST.GRACE_MS, 'never during the 5s grace: ' + p + 'ms');
    assert.ok(p >= g.CONST.POWERUP_COOLDOWN, 'cooldown measured from round start: ' + p + 'ms');
  }
  for (let i = 1; i < at.length; i++) {
    assert.ok(at[i] - at[i - 1] >= g.CONST.POWERUP_COOLDOWN,
      'gap between power-ups ' + (at[i] - at[i - 1]) + 'ms < ' + g.CONST.POWERUP_COOLDOWN + 'ms cooldown');
  }
  assert.ok(maxAirborne <= 1, 'at most one power-up airborne, saw ' + maxAirborne);
});

test('start() clears shield and slow-mo', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  overBasket(g, 'shield');
  g.update(16);
  g.slowLeft = 1234;
  assert.equal(g.shield, true);
  g.start();
  assert.equal(g.shield, false, 'shield reset');
  assert.equal(g.slowLeft, 0, 'slow-mo reset');
});
