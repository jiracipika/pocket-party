/* Pocket Party: Turbo Kart — deterministic core.
 * Pure ES5 UMD: no DOM, no clock, no ambient randomness — time enters via
 * update(dtMs), randomness is injected (createGame({ rng })). Auto-throttle
 * kart racing: hold left/right to steer, chase checkpoints for time, dodge
 * bananas, grab boost boxes. Same contract as the other Pocket Party cores. */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.PocketGame = factory();
  }
})(typeof global !== 'undefined' ? global : this, function () {
  'use strict';

  // ---- world constants ----
  var SEGMENT_LENGTH = 200;      // world units per road segment
  var RUMBLE_LENGTH = 3;         // segments per rumble stripe (renderer)
  var TARGET_SEGMENTS = 1600;    // one loop of the track (varies a little per seed)
  // checkpoints: 4 per lap, aligned to the FINAL built length (quarter laps),
  // so the awards always land on drawn banners — see buildTrack's post-pass.

  var BASE_TIMER_MS = 26000;     // clock at the start line
  var CHECKPOINT_BONUS_MS = 9000;
  var TIMER_CAP_MS = 45000;      // checkpoint time is capped here

  var MAX_SPEED = 9200;          // world units/s
  var ACCEL = 4300;              // units/s^2 auto-throttle
  var BOOST_MAX = 13200;         // speed cap while boosted (~1.43x)
  var BOOST_ACCEL = 9500;
  var BOOST_DECAY = 6500;        // bleed back to MAX_SPEED when boost ends
  var OFFROAD_LIMIT = 2600;      // grass speed cap
  var OFFROAD_DECEL = 8200;
  var BOOST_TIME_S = 2.2;        // per box, refreshes on pickup

  var STEER_RATE = 2.4;          // playerX units/s at full speed
  var CENTRIFUGAL = 0.24;        // curve pull: dt * 2 * speedPct^2 * curve * k
  var PLAYER_X_MAX = 2.6;        // hard lateral bound (grass ends past ~1.9)
  var ROAD_EDGE = 1.0;           // playerX of the road edge

  var SPIN_TIME_S = 1.05;        // banana spin-out
  var SPIN_SPEED_CAP = 1800;     // speed drops here when the spin starts
  var SPIN_DECEL = 2600;         // extra bleed while spinning
  var SPIN_FLOOR = 900;

  var SCORE_PER_UNIT = 1 / 90;   // distance points
  var BOOST_POINTS = 150;
  var CHECKPOINT_POINTS = 250;
  var LAP_POINTS = 500;

  var OBJ_HIT = 0.38;            // banana hit half-width (playerX units)
  var OBJ_PICKUP = 0.46;         // boost box pickup half-width
  var BANANA_GAP = 7;            // candidate lanes for bananas (segment modulo)
  var BOOST_GAP = 21;            // boost boxes live on the 21s

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function easeIn(a, b, p) { return a + (b - a) * p * p; }
  function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5); }

  // Procedural looped track: straights, eased curves, sine hills. The final
  // sections re-level the height to 0 and end straight, so the wrap is
  // seamless. Deterministic given rng.
  function buildTrack(rng) {
    var segs = [];
    var lastY = 0;

    function addSegment(curve, y) {
      var n = segs.length;
      segs.push({
        index: n,
        curve: curve,
        y1: lastY,
        y2: y,
        objs: [],
        checkpoint: false       // assigned in the post-build pass below
      });
      lastY = y;
    }

    function addRoad(enter, hold, leave, curve, dy) {
      var startY = lastY, endY = startY + dy, total = enter + hold + leave, n = 0, i;
      for (i = 0; i < enter; i++) { n++; addSegment(easeIn(0, curve, i / enter), easeInOut(startY, endY, n / total)); }
      for (i = 0; i < hold; i++) { n++; addSegment(curve, easeInOut(startY, endY, n / total)); }
      for (i = 0; i < leave; i++) { n++; addSegment(easeInOut(curve, 0, i / leave), easeInOut(startY, endY, n / total)); }
    }

    addRoad(20, 40, 20, 0, 0); // calm start straight
    while (segs.length < TARGET_SEGMENTS - 140) {
      var r = rng();
      if (r < 0.2) {
        addRoad(10 + Math.floor(rng() * 15), 20 + Math.floor(rng() * 30), 10 + Math.floor(rng() * 15), 0, 0);
      } else if (r < 0.62) {
        var c = (2 + rng() * 3) * (rng() < 0.5 ? -1 : 1);
        addRoad(25 + Math.floor(rng() * 20), 20 + Math.floor(rng() * 25), 25 + Math.floor(rng() * 20), c, 0);
      } else if (r < 0.82) {
        addRoad(25, 20, 25, 0, hillDelta(rng, lastY));
      } else {
        var c2 = (1.5 + rng() * 2.5) * (rng() < 0.5 ? -1 : 1);
        addRoad(30, 20, 30, c2, hillDelta(rng, lastY));
      }
    }
    // close the loop: re-level height, then a plain finishing straight
    if (Math.abs(lastY) > 1) addRoad(30, 30, 30, 0, -lastY);
    addRoad(10, 30, 10, 0, 0);

    // objects: bananas on the 7s, boost boxes on the 21s (never both).
    // The first 100 segments stay clear: a calm launch straight (family
    // parity with Snack Catch's bomb-free opening).
    for (var i = 100; i < segs.length; i++) {
      if (i % BOOST_GAP === 0) {
        if (rng() < 0.62) segs[i].objs.push({ type: 'boost', x: -0.7 + rng() * 1.4 });
      } else if (i % BANANA_GAP === 0) {
        if (rng() < 0.5) segs[i].objs.push({ type: 'banana', x: -0.75 + rng() * 1.5 });
      }
    }
    // the tail is finishing straight: trim it so the length divides evenly
    // into 4 quarter-lap checkpoints, with the 4th award landing exactly on
    // the start arch (index 0) every lap.
    segs.length -= segs.length % 4;
    var cpEvery = segs.length / 4;
    for (var j = 0; j < segs.length; j++) segs[j].checkpoint = j % cpEvery === 0;
    segs.cpEvery = cpEvery;
    return segs;
  }

  function hillDelta(rng, lastY) {
    var d = 500 + rng() * 1800;
    if (lastY > 2200) return -d;   // soft ceiling: force downhill
    if (lastY < -1200) return d;   // soft floor: force uphill
    return rng() < 0.5 ? -d : d;
  }

  function createGame(opts) {
    opts = opts || {};
    var rng = opts.rng || function () { return 0.5; };
    var segments = buildTrack(rng);
    var cpEvery = segments.cpEvery;
    var trackLength = segments.length * SEGMENT_LENGTH;

    var g = {
      W: 360, H: 640,
      state: 'ready',            // ready | playing | paused | over
      score: 0, best: 0,
      bonus: 0,                  // pickup/checkpoint/lap points (score = distance pts + bonus)
      timeLeft: BASE_TIMER_MS,
      speed: 0, topSpeed: 0,
      playerX: 0,                // road units; 0 = center, ±1 = road edge
      position: 0,               // z along the looped track (units)
      odo: 0,                    // total distance ever traveled (never wraps)
      cpEvery: cpEvery,          // crossed segments per checkpoint (quarter lap)
      nextCpAbs: cpEvery,
      distance: 0,
      lap: 0,
      checkpoints: 0, bananasHit: 0, boostsTaken: 0,
      boostTimer: 0, spinTimer: 0,
      offroad: false,
      input: { left: false, right: false },
      segments: segments,
      trackLength: trackLength,
      taken: {},                 // 'segIndex:objIndex' -> true, per run
      events: [],                // ['start'|'boost'|'spin'|'checkpoint'|'lap'|'over', ...]
      _rng: rng
    };

    function segmentAt(z) {
      return segments[Math.floor(z / SEGMENT_LENGTH) % segments.length];
    }

    function endRun() {
      if (g.state === 'playing' || g.state === 'paused') {
        g.state = 'over';
        g.input.left = false; g.input.right = false;
        g.events.push(['over']);
      }
      return g.state;
    }

    function recomputeScore() {
      g.score = Math.floor(g.distance * SCORE_PER_UNIT) + g.bonus;
    }

    function update(dtMs) {
      if (g.state !== 'playing' || typeof dtMs !== 'number' || !isFinite(dtMs) || dtMs <= 0) return g;
      var dt = Math.min(dtMs, 100) / 1000;

      g.timeLeft -= dtMs;
      if (g.timeLeft <= 0) {
        g.timeLeft = 0;
        recomputeScore();
        endRun();
        return g;
      }

      var seg = segmentAt(g.position);
      var speedPct = g.speed / MAX_SPEED;
      var oldPos = g.position;

      // spin-out: no steering, no pull, hard speed loss
      if (g.spinTimer > 0) {
        g.spinTimer = Math.max(0, g.spinTimer - dt);
        g.speed = Math.max(SPIN_FLOOR, g.speed - SPIN_DECEL * dt);
      } else {
        var steer = (g.input.left ? -1 : 0) + (g.input.right ? 1 : 0);
        g.playerX += dt * STEER_RATE * speedPct * steer;
        g.playerX -= dt * 2 * speedPct * speedPct * seg.curve * CENTRIFUGAL;
        g.playerX = clamp(g.playerX, -PLAYER_X_MAX, PLAYER_X_MAX);

        g.offroad = Math.abs(g.playerX) > ROAD_EDGE + 0.08;
        if (g.offroad && g.speed > OFFROAD_LIMIT) {
          g.speed = Math.max(OFFROAD_LIMIT, g.speed - OFFROAD_DECEL * dt);
        } else {
          var cap = g.boostTimer > 0 ? BOOST_MAX : MAX_SPEED;
          g.speed += (g.boostTimer > 0 ? BOOST_ACCEL : ACCEL) * dt;
          if (g.speed > cap) g.speed = Math.max(MAX_SPEED, g.speed - BOOST_DECAY * dt);
        }
      }

      // advance
      var ds = g.speed * dt;
      g.position += ds;
      g.odo += ds;
      g.distance += ds;
      while (g.position >= trackLength) {
        g.position -= trackLength;
        g.lap++;
        g.bonus += LAP_POINTS;
        g.events.push(['lap', g.lap]);
      }

      // crossed-segment scan: checkpoints + object hits
      var a = Math.floor(oldPos / SEGMENT_LENGTH);
      var b = Math.floor(g.position / SEGMENT_LENGTH);
      var absSeg = Math.floor(g.odo / SEGMENT_LENGTH);
      while (absSeg >= g.nextCpAbs) {
        g.checkpoints++;
        g.bonus += CHECKPOINT_POINTS;
        g.timeLeft = Math.min(TIMER_CAP_MS, g.timeLeft + CHECKPOINT_BONUS_MS);
        g.events.push(['checkpoint', g.checkpoints]);
        g.nextCpAbs += g.cpEvery;
      }
      if (b > a && b - a < 50) {
        for (var i = a + 1; i <= b; i++) {
          var s = segments[i % segments.length];
          for (var k = 0; k < s.objs.length; k++) {
            var key = s.index + ':' + k;
            if (g.taken[key]) continue;
            var o = s.objs[k];
            var half = o.type === 'boost' ? OBJ_PICKUP : OBJ_HIT;
            if (Math.abs(g.playerX - o.x) > half) continue;
            g.taken[key] = true;
            if (o.type === 'boost') {
              g.boostsTaken++;
              g.boostTimer = BOOST_TIME_S;
              g.bonus += BOOST_POINTS;
              g.events.push(['boost', g.boostsTaken]);
            } else if (g.spinTimer <= 0) {
              g.bananasHit++;
              g.spinTimer = SPIN_TIME_S;
              g.speed = Math.min(g.speed, SPIN_SPEED_CAP);
              g.boostTimer = 0;
              g.events.push(['spin', g.bananasHit]);
            } else {
              g.taken[key] = false; // already spinning: banana stays for next lap
            }
          }
        }
      }

      if (g.boostTimer > 0) g.boostTimer = Math.max(0, g.boostTimer - dt);
      if (g.speed > g.topSpeed) g.topSpeed = g.speed;
      recomputeScore();
      return g;
    }

    function setInput(left, right) {
      g.input.left = !!left;
      g.input.right = !!right;
    }

    function start() {
      g.state = 'playing';
      g.score = 0; g.bonus = 0; g.best = g.best || 0;
      g.timeLeft = BASE_TIMER_MS;
      g.speed = 0; g.topSpeed = 0;
      g.playerX = 0;
      g.position = 0; g.odo = 0; g.distance = 0;
      g.nextCpAbs = g.cpEvery;
      g.lap = 0;
      g.checkpoints = 0; g.bananasHit = 0; g.boostsTaken = 0;
      g.boostTimer = 0; g.spinTimer = 0;
      g.offroad = false;
      g.input.left = false; g.input.right = false;
      g.taken = {};
      g.events.length = 0;
      g.events.push(['start']);
      return g;
    }

    function pause() {
      if (g.state === 'playing') { g.state = 'paused'; g.input.left = false; g.input.right = false; g.events.push(['pause']); }
      return g.state;
    }
    function resume() {
      if (g.state === 'paused') { g.state = 'playing'; g.events.push(['resume']); }
      return g.state;
    }
    function togglePause() { return g.state === 'paused' ? resume() : pause(); }

    function takeEvents() { var e = g.events; g.events = []; return e; }

    g.update = update;
    g.setInput = setInput;
    g.start = start;
    g.pause = pause;
    g.resume = resume;
    g.togglePause = togglePause;
    g.endRun = endRun;
    g.takeEvents = takeEvents;
    g.segmentAt = segmentAt;
    g.CONST = {
      SEGMENT_LENGTH: SEGMENT_LENGTH, RUMBLE_LENGTH: RUMBLE_LENGTH,
      BASE_TIMER_MS: BASE_TIMER_MS, CHECKPOINT_BONUS_MS: CHECKPOINT_BONUS_MS, TIMER_CAP_MS: TIMER_CAP_MS,
      MAX_SPEED: MAX_SPEED, ACCEL: ACCEL, BOOST_MAX: BOOST_MAX, BOOST_ACCEL: BOOST_ACCEL,
      BOOST_DECAY: BOOST_DECAY, OFFROAD_LIMIT: OFFROAD_LIMIT, OFFROAD_DECEL: OFFROAD_DECEL,
      BOOST_TIME_S: BOOST_TIME_S, STEER_RATE: STEER_RATE, CENTRIFUGAL: CENTRIFUGAL,
      PLAYER_X_MAX: PLAYER_X_MAX, ROAD_EDGE: ROAD_EDGE,
      SPIN_TIME_S: SPIN_TIME_S, SPIN_SPEED_CAP: SPIN_SPEED_CAP,
      SCORE_PER_UNIT: SCORE_PER_UNIT, BOOST_POINTS: BOOST_POINTS,
      CHECKPOINT_POINTS: CHECKPOINT_POINTS, LAP_POINTS: LAP_POINTS,
      OBJ_HIT: OBJ_HIT, OBJ_PICKUP: OBJ_PICKUP
    };
    return g;
  }

  return {
    createGame: createGame,
    buildTrack: buildTrack,
    mulberry32: mulberry32,
    clamp: clamp,
    easeInOut: easeInOut,
    VERSION: '1.0.0'
  };
});
