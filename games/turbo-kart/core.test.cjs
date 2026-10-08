'use strict';
// Node built-in test runner: node --test games/turbo-kart/core.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const Kart = require('./core.js');

const STEP = 16; // ms per simulated frame
const SEG = Kart.createGame({ rng: () => 0.5 }).CONST.SEGMENT_LENGTH;

function fixedRng() {
  let x = 123456789;
  return function () { x = (x * 1103515245 + 12345) >>> 0; return x / 4294967296; };
}
function seededRng(seed) {
  let a = seed | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function newGame(seed) { return Kart.createGame({ rng: seededRng(seed === undefined ? 42 : seed) }); }
function play(g, ms, fn) {
  for (let t = 0; t < ms && g.state === 'playing'; t += STEP) {
    if (fn) fn(t);
    g.update(STEP);
  }
  return g;
}
// park the kart just before segment idx so the next movement crosses it
function placeBefore(g, idx) {
  g.position = ((idx * SEG - 40) % g.trackLength + g.trackLength) % g.trackLength;
}
function findSeg(g, pred) { for (const s of g.segments) if (pred(s)) return s; throw new Error('no segment matches'); }

test('module shape (UMD exports)', () => {
  for (const key of ['createGame', 'buildTrack', 'mulberry32', 'clamp', 'easeInOut', 'VERSION']) {
    assert.ok(Kart[key] !== undefined, 'exports ' + key);
  }
  const g = newGame();
  for (const key of ['update', 'setInput', 'start', 'pause', 'resume', 'togglePause', 'endRun', 'takeEvents', 'segmentAt', 'CONST']) {
    assert.ok(g[key] !== undefined, 'game exposes ' + key);
  }
  assert.equal(Kart.clamp(5, 0, 1), 1);
  assert.equal(Kart.easeInOut(0, 10, 1), 10);
  assert.equal(Kart.easeInOut(0, 10, 0), 0);
});

test('core purity: no DOM, no clock, no ambient randomness', () => {
  const src = fs.readFileSync(__dirname + '/core.js', 'utf8');
  assert.doesNotMatch(src, /document|window\b|Date\b|Math\.random|requestAnimationFrame/);
});

test('track: seed-deterministic, differs across seeds', () => {
  const shape = g => g.segments.map(s => [s.index, +s.curve.toFixed(4), Math.round(s.y2), s.objs.length]).join(';');
  const a = newGame(7), b = newGame(7), c = newGame(8);
  assert.equal(shape(a), shape(b), 'same seed -> identical track');
  assert.notEqual(shape(a), shape(c), 'different seed -> different track');
});

test('track: seamless loop closure (height returns to 0, chain continuous, ends straight)', () => {
  const g = newGame(3);
  const segs = g.segments;
  assert.equal(segs[0].y1, 0, 'starts level');
  for (let i = 1; i < segs.length; i++) {
    assert.equal(segs[i].y1, segs[i - 1].y2, 'y chain continuous at ' + i);
  }
  assert.equal(segs[segs.length - 1].y2, 0, 'loop re-levels to 0');
  for (let i = segs.length - 12; i < segs.length; i++) assert.equal(segs[i].curve, 0, 'finishing straight');
  for (const s of segs) {
    assert.ok(Math.abs(s.curve) <= 5.5, 'curve bounded');
    assert.ok(s.y2 > -2400 && s.y2 < 3400, 'height bounded');
  }
});

test('track: checkpoints flagged every quarter lap including the start arch', () => {
  const g = newGame(5);
  const cpEvery = g.cpEvery;
  assert.ok(cpEvery >= 300 && cpEvery <= 500, 'quarter-lap period sane: ' + cpEvery);
  const flagged = g.segments.filter(s => s.checkpoint).map(s => s.index);
  assert.deepEqual(flagged, [0, cpEvery, cpEvery * 2, cpEvery * 3]);
});

test('track: bananas and boost boxes present, bounded, never on the same segment', () => {
  const g = newGame(11);
  let bananas = 0, boosts = 0;
  for (const s of g.segments) {
    const kinds = s.objs.map(o => o.type);
    assert.ok(!(kinds.includes('banana') && kinds.includes('boost')), 'no mixed segments');
    for (const o of s.objs) {
      assert.ok(o.x > -0.8 && o.x < 0.8, 'object x within road corridor');
      if (o.type === 'banana') bananas++; else boosts++;
    }
  }
  assert.ok(bananas > 40, 'enough bananas: ' + bananas);
  assert.ok(boosts > 10, 'enough boost boxes: ' + boosts);
});

test('start resets the run', () => {
  const g = newGame();
  g.start(); play(g, 1500, (t) => g.setInput(t % 40 < 15, t % 40 < 30)); g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.score, 0); assert.equal(g.bonus, 0);
  assert.equal(g.timeLeft, g.CONST.BASE_TIMER_MS);
  assert.equal(g.speed, 0); assert.equal(g.playerX, 0);
  assert.equal(g.position, 0); assert.equal(g.odo, 0); assert.equal(g.distance, 0);
  assert.equal(g.lap, 0); assert.equal(g.checkpoints, 0);
  assert.equal(g.bananasHit, 0); assert.equal(g.boostsTaken, 0);
  assert.equal(g.boostTimer, 0); assert.equal(g.spinTimer, 0);
  assert.equal(Object.keys(g.taken).length, 0);
});

test('auto-throttle: speed builds from a standstill without input', () => {
  const g = newGame(); g.start();
  play(g, 2000, () => { g.playerX = 0; }); // pin center: no curve pull, no grass
  assert.ok(g.speed > g.CONST.MAX_SPEED * 0.5, 'half throttle in ~2s (speed ' + Math.round(g.speed) + ')');
  // settle phase pinned to the empty launch straight: no objects, no curves
  play(g, 4000, () => { g.position = 5 * SEG; g.playerX = 0; });
  assert.ok(Math.abs(g.speed - g.CONST.MAX_SPEED) < 1, 'settles at MAX_SPEED');
});

test('steering scales with speed and is clamped', () => {
  const g = newGame(); g.start();
  g.setInput(true, false); g.update(STEP);
  assert.equal(g.playerX, 0, 'no steering authority at zero speed');
  g.position = 5 * SEG; g.playerX = 0; // straight section: no pull
  g.speed = g.CONST.MAX_SPEED / 2;
  g.update(100); // single step: rate uses the pre-accel speed
  assert.ok(Math.abs(g.playerX + g.CONST.STEER_RATE * 0.5 * 0.1) < 1e-9,
    'left steer moves -steerRate * speedPct * dt (got ' + g.playerX + ')');
  g.setInput(false, true); play(g, 20000, () => {});
  assert.ok(Math.abs(g.playerX) <= g.CONST.PLAYER_X_MAX + 1e-9, 'clamped hard bound');
});

test('centrifugal pull on curves; steering counters it', () => {
  const curveSeg = findSeg(newGame(21), s => s.curve >= 3.5);
  const pull = (steerRight) => {
    const g = newGame(21); g.start();
    g.position = curveSeg.index * SEG + 10;
    g.speed = g.CONST.MAX_SPEED;
    g.setInput(false, steerRight);
    play(g, 120);
    return g.playerX;
  };
  assert.ok(pull(false) < -0.08, 'positive curve pulls the kart left, got ' + pull(false).toFixed(3));
  assert.ok(pull(true) > pull(false), 'holding right fights the pull');
});

test('off-road grass caps speed at OFFROAD_LIMIT', () => {
  const g = newGame(); g.start();
  g.position = 10 * SEG; // starting straight, no curve interference
  g.speed = g.CONST.MAX_SPEED;
  g.playerX = 1.5;
  play(g, 6000);
  assert.equal(g.offroad, true);
  assert.equal(g.speed, g.CONST.OFFROAD_LIMIT, 'grass decel floors at the off-road cap');
});

test('banana: spin-out, hard speed cap, boost canceled, object consumed', () => {
  const g = newGame(33); g.start();
  const seg = findSeg(g, s => s.objs.some(o => o.type === 'banana'));
  const key = seg.index + ':0';
  g.position = ((seg.index * SEG - 40) % g.trackLength + g.trackLength) % g.trackLength;
  g.playerX = seg.objs[0].x;
  g.speed = 6200;
  g.boostTimer = 1.5;
  play(g, 120);
  assert.ok(g.spinTimer > 0, 'spin timer engaged');
  assert.ok(g.speed <= g.CONST.SPIN_SPEED_CAP, 'speed clamped on impact');
  assert.equal(g.boostTimer, 0, 'boost lost in the grass');
  assert.equal(g.bananasHit, 1);
  assert.equal(g.taken[key], true, 'banana consumed');
  assert.ok(g.takeEvents().some(e => e[0] === 'spin' && e[1] === 1), 'spin event');
  // a second banana during the spin must not stack penalties
  const seg2 = findSeg(g, s => s.index !== seg.index && s.objs.some(o => o.type === 'banana'));
  g.position = ((seg2.index * SEG - 100) % g.trackLength + g.trackLength) % g.trackLength;
  g.playerX = seg2.objs[0].x;
  if (g.spinTimer <= 0) g.spinTimer = 0.5; // still spinning for the pass
  play(g, 300);
  assert.equal(g.bananasHit, 1, 'no double penalty mid-spin');
});

test('spin disables steering and centrifugal pull, then runs down', () => {
  const g = newGame(35); g.start();
  g.spinTimer = 0.8;
  g.speed = g.CONST.SPIN_SPEED_CAP;
  const x0 = g.playerX;
  g.setInput(true, true); // both held: still nothing while spinning
  play(g, 250); // 250ms < SPIN_TIME_S: the whole window is spent spinning
  assert.ok(g.spinTimer > 0, 'still spinning at 250ms');
  assert.equal(g.playerX, x0, 'lateral frozen while spinning');
  play(g, 3000, () => { g.playerX = 0; });
  assert.equal(g.spinTimer, 0, 'spin timer runs down');
});

test('boost box: timer, points, raised speed cap, decay back to MAX', () => {
  const g = newGame(37); g.start();
  const seg = findSeg(g, s => s.objs.some(o => o.type === 'boost'));
  g.position = ((seg.index * SEG - 40) % g.trackLength + g.trackLength) % g.trackLength;
  g.playerX = seg.objs[0].x;
  g.speed = g.CONST.MAX_SPEED;
  play(g, 100);
  assert.ok(g.boostTimer > g.CONST.BOOST_TIME_S - 0.15, 'boost timer fresh');
  assert.equal(g.boostsTaken, 1);
  assert.ok(g.bonus >= g.CONST.BOOST_POINTS, 'pickup points banked');
  assert.ok(g.takeEvents().some(e => e[0] === 'boost'), 'boost event');
  // raised cap: on the empty starting straight, boosted accel passes MAX_SPEED
  g.position = 5 * SEG; g.playerX = 0; g.boostTimer = 2.0; g.speed = g.CONST.MAX_SPEED;
  play(g, 300, () => { g.position = 5 * SEG; g.playerX = 0; });
  assert.ok(g.speed > g.CONST.MAX_SPEED, 'boosted past the normal cap (' + Math.round(g.speed) + ')');
  // once the boost burns out the speed bleeds back to exactly MAX
  g.boostTimer = 0;
  play(g, 4000, () => { g.position = 5 * SEG; g.playerX = 0; });
  assert.ok(Math.abs(g.speed - g.CONST.MAX_SPEED) < 1, 'bleeds back to MAX (' + Math.round(g.speed) + ')');
});

test('checkpoint: +time, +points, exactly once per crossing', () => {
  const g = newGame(); g.start();
  g.takeEvents();
  g.speed = 8000;
  g.odo = g.cpEvery * SEG - 100;
  g.position = g.odo % g.trackLength;
  g.timeLeft = 4000;
  play(g, 120);
  assert.equal(g.checkpoints, 1, 'one checkpoint awarded');
  assert.ok(g.bonus >= g.CONST.CHECKPOINT_POINTS);
  assert.ok(g.timeLeft > 12000, 'time extended (timeLeft ' + Math.round(g.timeLeft) + ')');
  assert.ok(g.takeEvents().some(e => e[0] === 'checkpoint' && e[1] === 1), 'checkpoint event');
  play(g, 200); // still inside the same crossing band: no double award
  assert.equal(g.checkpoints, 1);
});

test('checkpoint time is capped at TIMER_CAP_MS', () => {
  const g = newGame(); g.start();
  g.speed = 8000;
  g.odo = g.cpEvery * SEG - 50;
  g.position = g.odo % g.trackLength;
  g.timeLeft = g.CONST.TIMER_CAP_MS - 10;
  g.update(16); // exactly one step: crosses, awards, caps — then stop
  assert.equal(g.checkpoints, 1);
  assert.equal(g.timeLeft, g.CONST.TIMER_CAP_MS);
});

test('lap wrap awards LAP_POINTS and keeps position continuous', () => {
  const g = newGame(); g.start();
  g.takeEvents();
  g.speed = g.CONST.MAX_SPEED;
  g.position = g.trackLength - 10;
  play(g, 200);
  assert.equal(g.lap, 1);
  assert.ok(g.bonus >= g.CONST.LAP_POINTS);
  assert.ok(g.position > 1400 && g.position < 2600, 'wrapped forward, not reset (pos ' + Math.round(g.position) + ')');
  assert.ok(g.takeEvents().some(e => e[0] === 'lap' && e[1] === 1), 'lap event');
});

test('score = distance points + bonus', () => {
  const g = newGame(); g.start();
  g.bonus = 400;
  play(g, 2000);
  const expected = Math.floor(g.distance * g.CONST.SCORE_PER_UNIT) + 400;
  assert.equal(g.score, expected);
  assert.ok(g.score > 100, 'meaningful scoring rate');
});

test('clock expiry ends the run', () => {
  const g = newGame(); g.start();
  g.timeLeft = 60;
  play(g, 500);
  assert.equal(g.state, 'over');
  assert.equal(g.timeLeft, 0);
  assert.ok(g.takeEvents().some(e => e[0] === 'over'));
});

test('pause freezes everything', () => {
  const g = newGame(); g.start();
  g.speed = 5000; g.update(STEP);
  g.pause();
  assert.equal(g.state, 'paused');
  const snap = [g.timeLeft, g.position, g.odo, g.speed, g.distance];
  play(g, 800);
  assert.deepEqual([g.timeLeft, g.position, g.odo, g.speed, g.distance], snap);
  assert.equal(g.resume(), 'playing');
  assert.equal(g.togglePause(), 'paused');
  assert.equal(g.togglePause(), 'playing');
});

test('invalid dt is a no-op', () => {
  const g = newGame(); g.start();
  g.speed = 5000; g.update(STEP);
  const snap = [g.timeLeft, g.position, g.odo, g.speed, g.distance, g.score];
  g.update(0); g.update(-5); g.update(NaN); g.update(Infinity);
  g.update('200'); g.update(null);
  assert.deepEqual([g.timeLeft, g.position, g.odo, g.speed, g.distance, g.score], snap);
});

test('huge dt is clamped: no tunneling blowups', () => {
  const g = newGame(); g.start();
  g.speed = g.CONST.BOOST_MAX;
  const odo0 = g.odo;
  g.update(60000);
  assert.ok(isFinite(g.position) && isFinite(g.odo) && isFinite(g.playerX), 'finite state');
  assert.ok(g.odo - odo0 <= g.CONST.BOOST_MAX * 0.11, 'distance clamped to ~100ms of travel');
});

test('deterministic: same seed + same inputs = identical run', () => {
  function run(seed) {
    const g = newGame(seed); g.start();
    play(g, 12000, (t) => g.setInput(t % 90 < 30, t % 60 < 20));
    return {
      score: g.score, lap: g.lap, checkpoints: g.checkpoints,
      bananas: g.bananasHit, boosts: g.boostsTaken,
      odo: Math.round(g.odo), x: +g.playerX.toFixed(4),
      timeLeft: Math.round(g.timeLeft)
    };
  }
  assert.deepEqual(run(99), run(99), 'same seed replays exactly');
});
