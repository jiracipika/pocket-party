'use strict';
// Node built-in test runner: node --test games/donut-dash/core.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const PocketGame = require('./core.js');

function fixedRng() { // deterministic 0..0.999 sequence
  let x = 987654321;
  return function () { x = (x * 1103515245 + 12345) >>> 0; return x / 4294967296; };
}
function newGame() { return PocketGame.createGame({ rng: fixedRng() }); }
const STEP = 16; // ms per simulated frame

function run(g, frames, input) {
  for (let i = 0; i < frames && g.state === 'playing'; i++) {
    if (input) input(i);
    g.update(STEP);
  }
}

test('start resets state', () => {
  const g = newGame();
  g.start(); g.update(16); g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.score, 0);
  assert.equal(g.hearts, 3);
  assert.equal(g.x, 0);
  assert.equal(g.time, 0);
  assert.equal(g.speed, g.CONST.SPEED_BASE);
  assert.equal(g.obstacles.length, 0);
  assert.equal(g.pickups.length, 0);
  assert.equal(g.player.y, g.CONST.GROUND_Y);
  assert.equal(g.player.onGround, true);
});

test('update no-op when not playing (ready/paused/over)', () => {
  const g = newGame();
  g.update(16);
  assert.equal(g.x, 0);
  assert.equal(g.obstacles.length, 0);
  g.start();
  g.pause();
  const t = g.time, x = g.x;
  g.update(100);
  assert.equal(g.time, t);
  assert.equal(g.x, x);
  g.resume(); g.update(16);
  assert.ok(g.time > 0);
});

test('jump: ground jump, one air jump, third ignored, reset on landing', () => {
  const g = newGame(); g.start();
  assert.equal(g.jump(), 1, 'first jump works from ground');
  assert.equal(g.jump(), 2, 'double jump works in air');
  assert.equal(g.jump(), 2, 'third jump ignored (returns current count)');
  run(g, 80); // ~1.3s: must land
  assert.equal(g.player.onGround, true);
  assert.equal(g.player.y, g.CONST.GROUND_Y);
  assert.equal(g.player.jumps, 0, 'jump budget reset on landing');
  assert.ok(g.jumpsUsed >= 2);
});

test('gravity keeps player at or above ground, never below', () => {
  const g = newGame(); g.start();
  for (let i = 0; i < 400; i++) {
    g.update(STEP);
    if (i === 30) g.jump();
    assert.ok(g.player.y <= g.CONST.GROUND_Y + 0.001, 'not below ground');
    assert.ok(g.player.y > 0, 'not above the sky');
  }
  assert.equal(g.player.y, g.CONST.GROUND_Y);
});

test('obstacles spawn ahead, cull behind, gaps stay jump-clearable', () => {
  const g = newGame(); g.start();
  let prevRight = -Infinity, maxSpeedSeen = 0;
  for (let i = 0; i < 3000 && g.state === 'playing'; i++) {
    g.update(STEP);
    maxSpeedSeen = Math.max(maxSpeedSeen, g.speed);
    for (const ob of g.obstacles) {
      assert.ok(ob.x + ob.w > g.x - 80 - 0.001, 'culled behind the camera');
      assert.ok(ob.x < g.x + g.W + 400, 'spawned just off screen');
      if (ob.x > prevRight) {
        const gap = ob.x - prevRight;
        if (prevRight > -Infinity) {
          assert.ok(gap >= g.speed * 1.04,
            `gap ${gap.toFixed(1)} must exceed speed ${g.speed.toFixed(1)} x 1.04`);
        }
        prevRight = ob.x + ob.w;
      }
    }
    // occasionally jump so the run survives; gaps stay valid regardless
    if (i % 40 === 0) g.jump();
  }
  assert.ok(prevRight > 0, 'obstacles were spawned');
  assert.ok(g.speed > g.CONST.SPEED_BASE, 'speed escalates');
});

test('running into a crate costs exactly one heart and grants i-frames', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  // let the natural first obstacle approach, standing still (no jumps)
  for (let i = 0; i < 400 && g.hits < 1; i++) g.update(STEP);
  assert.equal(g.hits, 1, 'crashed into the first crate');
  assert.equal(g.state, 'playing', 'one hit does not end the run');
  const heartsAfterFirst = g.hearts;
  assert.equal(heartsAfterFirst, g.CONST.HEARTS - 1);
  assert.ok(g.iframes > 0, 'mercy i-frames granted');
  // while i-frames last, a fresh overlapping obstacle cannot hit again
  const before = g.hearts;
  g.obstacles.push({ x: g.x + g.player.x - 5, y: g.CONST.GROUND_Y - 46, w: 42, h: 46, kind: 'crate', hit: false });
  g.update(STEP);
  assert.equal(g.hearts, before, 'i-frames block further hits');
});

test('the same obstacle cannot damage twice', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  const ob = { x: g.x + g.player.x - 5, y: g.CONST.GROUND_Y - 46, w: 42, h: 46, kind: 'crate', hit: false };
  g.obstacles.push(ob);
  g.iframes = 0;
  g.update(STEP);
  assert.equal(g.hearts, 2);
  g.iframes = 0; // force eligibility again
  ob.x = g.x + g.player.x - 5; // keep it overlapping
  g.update(STEP);
  assert.equal(g.hearts, 2, 'marked hit: no second damage');
});

test('three hits end the run with over event', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  run(g, 4000); // never jump: crates end the run
  assert.equal(g.state, 'over');
  assert.equal(g.hearts, 0);
  const evs = g.takeEvents();
  assert.ok(evs.some(e => e[0] === 'over'), 'over event emitted');
  assert.ok(evs.filter(e => e[0] === 'hit').length >= 3, 'three hit events');
});

test('pickups are collected for points and never damage', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  g.pickups.push({ x: g.x + g.player.x, y: g.player.y - 20, r: 12, kind: 'cookie' });
  const scoreBefore = g.score;
  g.update(STEP);
  assert.equal(g.pickupsGot, 1, 'pickup collected');
  assert.equal(g.score - scoreBefore, g.CONST.PICKUP_PTS);
  assert.equal(g.hearts, 3, 'pickups never damage');
});

test('score grows with distance and pickup bonuses', () => {
  const g = newGame(); g.start();
  run(g, 120);
  assert.ok(g.score >= Math.floor(g.x / 12), 'distance contributes to score');
  assert.ok(g.score > 0, 'running scores');
});

test('speed escalates and caps', () => {
  const g = newGame(); g.start();
  for (let i = 0; i < 120; i++) g.update(STEP);
  assert.ok(g.speed > g.CONST.SPEED_BASE, 'speed escalates');
  g.speed = g.CONST.SPEED_MAX - 1;
  for (let i = 0; i < 40; i++) g.update(STEP);
  assert.equal(g.speed, g.CONST.SPEED_MAX, 'speed capped');
});

test('jump clears a fixture crate without damage', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  // crate directly ahead at jumpable distance
  const ob = { x: g.x + g.player.x + 80, y: g.CONST.GROUND_Y - 46, w: 42, h: 46, kind: 'crate', hit: false };
  g.obstacles.push(ob);
  g._nextObstX = g.x + g.W + 5000; // suppress further spawns
  g.jump();
  for (let i = 0; i < 60 && ob.x + ob.w > g.x + g.player.x - g.player.w / 2; i++) g.update(STEP);
  assert.equal(g.hearts, 3, 'cleared without damage');
  assert.ok(ob.x + ob.w < g.x + g.player.x - g.player.w / 2, 'passed the crate');
});

test('invalid delta cannot corrupt live state', () => {
  const g = newGame(); g.start();
  const t = g.time, x = g.x;
  for (const dt of [NaN, Infinity, -100, 0, undefined, 'x']) g.update(dt);
  assert.equal(g.time, t);
  assert.equal(g.x, x);
  assert.equal(g.state, 'playing');
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

test('endRun finishes from playing or paused, idempotent', () => {
  const g = newGame(); g.start();
  assert.equal(g.endRun(), 'over');
  assert.ok(g.takeEvents().some(e => e[0] === 'over'));
  assert.equal(g.endRun(), 'over'); // no double events when already over
  const h = newGame(); h.start(); h.pause();
  assert.equal(h.endRun(), 'over', 'endRun works while paused');
});

test('restart after game over works', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  run(g, 4000);
  assert.equal(g.state, 'over');
  const finalScore = g.score;
  assert.ok(finalScore > 0);
  g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.score, 0);
  assert.equal(g.hearts, 3);
  assert.equal(g.obstacles.length, 0);
  assert.equal(g.pickups.length, 0);
  assert.equal(g.player.jumps, 0);
});

test('deterministic: same seed, same game', () => {
  const rngA = PocketGame.mulberry32(42), rngB = PocketGame.mulberry32(42);
  const a = PocketGame.createGame({ rng: rngA }), b = PocketGame.createGame({ rng: rngB });
  a.start(); b.start();
  for (let i = 0; i < 300; i++) {
    a.update(16); b.update(16);
    if (i % 45 === 0) { a.jump(); b.jump(); }
  }
  assert.deepEqual(
    a.obstacles.map(o => [o.x, o.y, o.w, o.h, o.kind]),
    b.obstacles.map(o => [o.x, o.y, o.w, o.h, o.kind]));
  assert.deepEqual(a.pickups.map(p => [p.x, p.y, p.kind]), b.pickups.map(p => [p.x, p.y, p.kind]));
  assert.equal(a.score, b.score);
  assert.equal(a.hearts, b.hearts);
});

test('events consumed by takeEvents', () => {
  const g = newGame(); g.start();
  g.jump();
  g.takeEvents();
  assert.equal(g.events.length, 0);
});

test('module shape (UMD exports)', () => {
  assert.equal(typeof PocketGame.createGame, 'function');
  assert.equal(typeof PocketGame.mulberry32, 'function');
  assert.equal(typeof PocketGame.clamp, 'function');
  assert.equal(typeof PocketGame.VERSION, 'string');
});

// ---- S2 fairness: readable-window regression lock (added 2026-09-27) ----

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

test('obstacles stay readable: >=450ms from spawn to the player at every speed', () => {
  // Idle player (no jumps): pure measurement of the spawn->reach window
  // across the whole speed ramp 240 -> 520 over 60 seconds of play.
  const g = PocketGame.createGame({ rng: mulberry32(42) });
  g.start();
  g.hearts = 1e9; // measurement run: survive crate hits for the full 60s
  let measured = 0, minMs = Infinity;
  for (let t = 0; t < 60000 && g.state !== 'over'; t += 16) {
    const px0 = g.x;
    for (const e of g.takeEvents()) {
      if (e[0] === 'spawn-ob') {
        // o.x is world coords; screen distance to the fixed player column
        const readablePx = (e[2] - px0) - 90 - g.CONST.PLAYER_X;
        const ms = readablePx / g.speed * 1000;
        minMs = Math.min(minMs, ms);
        measured++;
      }
    }
    g.update(16);
  }
  assert.ok(measured > 30, 'fixture must see real obstacles, got ' + measured);
  assert.ok(minMs >= 450,
    'obstacle readable window dipped to ' + minMs.toFixed(0) + 'ms at speed ' + g.speed);
});

test('no impossible sandwich: tall/double groups leave landing-recovery gap', () => {
  // Groups arrive as same-tick spawn-ob batches. After a tall (38x78) or a
  // double (crate +92px crate) the next group must leave the standard 1.05s
  // land-then-rejump window PLUS GAP_RECOVERY px of landing runway. Seed 7
  // demonstrably produced sub-recovery gaps after tall groups pre-fix.
  const RECOVERY = PocketGame.createGame({ rng: mulberry32(7) }).CONST.GAP_RECOVERY;
  const WIDTH = { tall: 38, wide: 80, crate: 42 };
  const g = PocketGame.createGame({ rng: mulberry32(7) });
  g.start();
  g.hearts = 1e9; // invariant run: survive the full 120s
  let batch = [], checked = 0, hardGroups = 0, prev = null;
  const check = (grp, speed) => {
    if (!grp.length) return;
    const right = grp[grp.length - 1].x + WIDTH[grp[grp.length - 1].kind];
    if (prev) {
      const gap = grp[0].x - prev.right, v = prev.speed;
      assert.ok(gap >= v * 1.05 - 1e-6,
        'gap ' + gap.toFixed(0) + 'px < land-then-rejump ' + (v * 1.05).toFixed(0) + 'px at speed ' + v);
      if (prev.hard) {
        hardGroups++;
        assert.ok(gap >= v * 1.05 + RECOVERY - 1e-6,
          'gap after hard group ' + gap.toFixed(0) + 'px < ' + (v * 1.05 + RECOVERY).toFixed(0) + 'px at speed ' + v);
      }
      checked++;
    }
    prev = { right: right, speed: speed, hard: grp.some(o => o.kind === 'tall') || grp.length > 1 };
  };
  for (let t = 0; t < 120000 && g.state !== 'over'; t += 16) {
    g.update(16);
    const speed = g.speed;
    for (const e of g.takeEvents()) {
      if (e[0] === 'spawn-ob') batch.push({ kind: e[1], x: e[2] });
    }
    if (batch.length) { check(batch, speed); batch = []; }
  }
  assert.ok(checked > 25, 'fixture must see real group sequences, got ' + checked);
  assert.ok(hardGroups > 4, 'fixture must see tall/double groups, got ' + hardGroups);
});

test('chain multiplier tiers: x1 below 5, x2 at 5-9, x3 at 10+', () => {
  const m = PocketGame.chainMultFor;
  assert.equal(m(0), 1); assert.equal(m(1), 1); assert.equal(m(4), 1);
  assert.equal(m(5), 2); assert.equal(m(7), 2); assert.equal(m(9), 2);
  assert.equal(m(10), 3); assert.equal(m(25), 3);
});

test('chain scoring in play: tiers apply, crash resets the chain', () => {
  const g = PocketGame.createGame({ rng: () => 0.5 });
  g.start();
  // five pickups in a row: 4 at x1 then the 5th at x2 (chain tier edge)
  const groundY = g.CONST.GROUND_Y;
  for (let i = 0; i < 5; i++) {
    g.pickups.push({ x: g.x + g.player.x, y: groundY - 20, r: 12, kind: 'cookie' });
    const before = g.pickupScore;
    g.update(16);
    assert.equal(g.pickupScore - before, g.CONST.PICKUP_PTS * (i >= 4 ? 2 : 1),
      'pickup ' + (i + 1) + ' scores at ' + (i >= 4 ? 'x2' : 'x1'));
  }
  assert.equal(g.chain, 5);
  assert.equal(g.chainMult, 2);
  assert.equal(g.bestChain, 5);
  // crash resets the chain; the next pickup scores x1 again
  g.iframes = 0;
  g.obstacles.push({ x: g.x + g.player.x - 10, y: groundY - 46, w: 42, h: 46, kind: 'crate', hit: false });
  g.update(16);
  assert.equal(g.chain, 0);
  assert.equal(g.chainMult, 1);
  assert.equal(g.bestChain, 5, 'bestChain survives the crash');
  g.pickups.push({ x: g.x + g.player.x, y: groundY - 20, r: 12, kind: 'cookie' });
  const before = g.pickupScore;
  g.update(16);
  assert.equal(g.pickupScore - before, g.CONST.PICKUP_PTS, 'post-crash pickup back to x1');
});

test('snack trails sit on the jump arc inside the gap (reachable)', () => {
  // Reachability envelope: a trail point is reachable iff its height above
  // ground is within the single-jump apex (jump can start anywhere before it)
  // and it stays clear of both the group behind and the group ahead.
  const C = PocketGame.createGame({ rng: mulberry32(11) }).CONST;
  const apex = C.JUMP_V * C.JUMP_V / (2 * C.GRAVITY);
  const WIDTH = { tall: 38, wide: 80, crate: 42 };
  const g = PocketGame.createGame({ rng: mulberry32(11) });
  g.start();
  g.hearts = 1e9;
  let maxSeenX = -Infinity, groups = [], batch = [];
  let trails = 0, points = 0;
  for (let t = 0; t < 120000 && g.state !== 'over'; t += 16) {
    g.update(16);
    for (const e of g.takeEvents()) {
      if (e[0] === 'spawn-ob') batch.push({ kind: e[1], x: e[2] });
    }
    if (batch.length) {
      const last = batch[batch.length - 1];
      groups.push({ left: batch[0].x, right: last.x + WIDTH[last.kind] });
      batch = [];
    }
    for (const p of g.pickups) {
      if (p.x <= maxSeenX) continue;
      maxSeenX = p.x;
      // find the group behind (last group whose right edge is left of p.x)
      let behind = null, ahead = null;
      for (const grp of groups) {
        if (grp.right <= p.x) behind = grp;
        else if (!ahead || grp.left < ahead.left) ahead = grp;
      }
      if (!behind) continue; // starter pickups, none expected
      trails++; points++;
      const h = C.GROUND_Y - p.y;
      assert.ok(h >= 15 && h <= apex + 1e-6,
        'trail height ' + h.toFixed(0) + 'px outside jump envelope (apex ' + apex.toFixed(0) + ')');
      assert.ok(p.x >= behind.right + 20, 'trail starts inside the group behind');
      if (ahead) assert.ok(p.x <= ahead.left - 40,
        'trail point ' + (p.x - behind.right).toFixed(0) + 'px past group intrudes on next group');
    }
  }
  assert.ok(points > 20, 'fixture must see real trail points, got ' + points);
});
