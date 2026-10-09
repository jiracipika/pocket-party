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
  assert.ok(g.speed <= g.CONST.BOOST_MAX + 1e-9,
    'boost accel is hard-capped at BOOST_MAX (' + Math.round(g.speed) + ')');
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

// ---------- ghost recording, codec and playback ----------

test('recording: samples every 250ms of play-time, pauses excluded, reset on start', () => {
  const g = newGame(); g.start();
  g.speed = g.CONST.MAX_SPEED;
  for (let i = 0; i < 40; i++) g.update(100); // 4s of play
  const rec = g.getRecording();
  assert.equal(rec.intervalMs, 250);
  assert.equal(rec.odos.length, 17, 'samples at 0,250,...,4000 (17)');
  assert.equal(rec.odos[0], 0, 'first sample at the line');
  assert.ok(Math.abs(rec.odos[rec.odos.length - 1] - g.odo) < g.CONST.MAX_SPEED * 0.25 + 1,
    'last sample within one interval of current odo');
  g.pause();
  for (let i = 0; i < 20; i++) g.update(100); // 2s paused: no new samples
  assert.equal(g.getRecording().odos.length, 17, 'pause adds no samples');
  g.resume(); g.update(250);
  assert.equal(g.getRecording().odos.length, 18, 'one sample per interval after resume');
  const before = g.getRecording();
  g.start();
  assert.deepEqual(g.getRecording().odos, [0], 'start() resets the recording');
  assert.equal(g.elapsed, 0);
  assert.deepEqual(before.odos.length > 0, true);
});

test('recording: caps at REC_MAX_SAMPLES', () => {
  const g = newGame(); g.start();
  for (let i = 0; i < 2000 && g.state === 'playing'; i++) g.update(50); // 100s
  assert.ok(g.getRecording().odos.length <= g.CONST.REC_MAX_SAMPLES, 'capped');
});

test('codec: encode -> decode round-trips exactly', () => {
  const odos = [0, 800, 1750, 2600, 3700, 4850];
  const xs = [0, 0.4, 0.9, 0.2, -0.6, -1.1];
  const code = Kart.encodeGhost(0xdeadbeef, 1520, 250, odos, xs);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(code), 'base64url alphabet only');
  const dec = Kart.decodeGhost(code);
  assert.ok(dec, 'decodes');
  assert.equal(dec.seed, 0xdeadbeef >>> 0);
  assert.equal(dec.score, 1520);
  assert.equal(dec.intervalMs, 250);
  assert.equal(dec.odos.length, odos.length);
  assert.deepEqual(dec.odos, odos, 'odo deltas round-trip');
  for (let i = 0; i < xs.length; i++) {
    assert.ok(Math.abs(dec.xs[i] - xs[i]) < 0.03, 'playerX quantized ~0.02 (got ' + dec.xs[i].toFixed(3) + ')');
  }
  // a ~90s ghost stays inside shareable URL budgets
  const long = Kart.encodeGhost(7, 9000, 250, Array.from({ length: 360 }, (_, i) => i * 2200), Array.from({ length: 360 }, () => 0));
  assert.ok(long.length < 1300, 'max ghost code length ' + long.length);
});

test('codec: malformed input returns null, never throws', () => {
  const good = Kart.encodeGhost(1, 1, 250, [0, 100], [0, 0]);
  const bads = ['', '!!!', 'abcd', good.slice(0, -3) + '~',
    Kart.encodeGhost(1, 1, 40, [0, 100], [0, 0])]; // interval below the 50ms floor
  for (const bad of bads) {
    assert.equal(Kart.decodeGhost(bad), null, 'null for ' + JSON.stringify(String(bad).slice(0, 12)));
  }
  // valid code with the version byte flipped (byte0: 0x01 -> 0x02)
  assert.equal(Kart.decodeGhost(null), null);
  assert.equal(Kart.decodeGhost(42), null);
  assert.equal(Kart.decodeGhost(good.replace(/^AQ/, 'Ag')), null, 'wrong version rejected');
  assert.ok(Kart.decodeGhost(good), 'sanity: good code decodes');
});

test('ghost playback: interpolation, end-of-run, no ghost', () => {
  const raw = { intervalMs: 250, odos: [0, 1000, 2000], xs: [0, 1, -1], score: 700 };
  const g = Kart.createGame({ rng: seededRng(5), ghost: raw });
  assert.ok(g.ghost, 'ghost attached');
  assert.equal(g.ghost.score, 700);
  const at0 = g.ghostAt(0);
  assert.equal(at0.odo, 0);
  const mid = g.ghostAt(125);
  assert.ok(Math.abs(mid.odo - 500) < 1e-9 && Math.abs(mid.x - 0.5) < 1e-9, 'linear between samples');
  const end = g.ghostAt(500);
  assert.equal(end.odo, 2000);
  const coast = g.ghostAt(640); // within one interval past the end: holds final position
  assert.equal(coast.odo, 2000);
  assert.equal(g.ghostAt(751), null, 'ghost gone one interval after its last sample');
  assert.equal(g.ghostAt(-1), null);
  const none = Kart.createGame({ rng: seededRng(5) });
  assert.equal(none.ghost, null);
  assert.equal(none.ghostAt(0), null);
  // malformed ghost objects are dropped, not thrown
  for (const bad of [{}, { odos: [0], xs: [0], intervalMs: 250 }, { odos: [0, 1], xs: [0], intervalMs: 250 },
    { odos: [0, 1], xs: [0, 0], intervalMs: 10 }]) {
    assert.equal(Kart.createGame({ rng: seededRng(5), ghost: bad }).ghost, null, 'bad ghost dropped');
  }
});

test('ghost is observational: identical physics with and without one', () => {
  function run(withGhost) {
    const opts = { rng: seededRng(77) };
    if (withGhost) opts.ghost = { intervalMs: 250, odos: [0, 5000, 9999], xs: [0, 2, -2], score: 42 };
    const g = Kart.createGame(opts); g.start();
    play(g, 9000, (t) => g.setInput(t % 70 < 25, t % 110 < 40));
    return {
      score: g.score, odo: Math.round(g.odo), x: +g.playerX.toFixed(4),
      bananas: g.bananasHit, boosts: g.boostsTaken, timeLeft: Math.round(g.timeLeft)
    };
  }
  assert.deepEqual(run(true), run(false), 'ghost must never touch the simulation');
});

test('full ghost round-trip: record a real run, decode, race against it', () => {
  function play(seed, ghost) {
    const opts = { rng: seededRng(seed) };
    if (ghost) opts.ghost = ghost;
    const g = Kart.createGame(opts); g.start();
    play9s: for (let t = 0; t < 9000 && g.state === 'playing'; t += STEP) {
      g.setInput(t % 80 < 30, t % 50 < 18);
      g.update(STEP);
    }
    return g;
  }
  const first = play(123, null);
  const rec = first.getRecording();
  assert.ok(rec.odos.length >= 30, '9s of samples');
  const code = Kart.encodeGhost(123, rec.score, rec.intervalMs, rec.odos, rec.xs);
  const dec = Kart.decodeGhost(code);
  assert.ok(dec, 'friend-side decode');
  const second = play(dec.seed, dec);
  assert.equal(second.ghost.score, rec.score, 'ghost target score survives the trip');
  // same seed -> same track -> identical line: the racer should sit on the ghost
  const ga = second.ghostAt(second.elapsed);
  assert.ok(ga, 'ghost still alive at the copilot time');
  assert.ok(Math.abs(second.odo - ga.odo) < 500, 'same inputs -> same line (delta ' +
    Math.round(second.odo - ga.odo) + ' units)');
});
