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

  // ---- ghost recording (share-your-line via Snap link) ----
  var REC_INTERVAL_MS = 250;     // sample period, play-time only (pauses excluded)
  var REC_MAX_SAMPLES = 360;     // 90s of line; longer runs share a partial ghost
  var GHOST_X_RANGE = 5.2;       // playerX quantization span (-2.6 .. 2.6)
  var GHOST_FMT_VERSION = 1;

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

  // ---------- ghost codec: pure bytes -> base64url, no host APIs ----------
  var B64URL_AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function bytesToB64url(bytes) {
    var out = '', i;
    for (i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += B64URL_AL[b0 >> 2];
      out += B64URL_AL[((b0 & 3) << 4) | (b1 >> 4)];
      out += i + 1 < bytes.length ? B64URL_AL[((b1 & 15) << 2) | (b2 >> 6)] : '';
      out += i + 2 < bytes.length ? B64URL_AL[b2 & 63] : '';
    }
    return out;
  }

  function b64urlToBytes(str) {
    if (typeof str !== 'string' || str.length === 0) return null;
    var clean = str.replace(/=+$/, '');
    var out = [], acc = 0, bits = 0, i, v;
    for (i = 0; i < clean.length; i++) {
      v = B64URL_AL.indexOf(clean.charAt(i));
      if (v < 0) return null;
      acc = ((acc << 6) | v) & 0xFFFF;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((acc >> bits) & 255);
      }
    }
    return out;
  }

  function BitWriter() { this.bytes = []; this.acc = 0; this.cnt = 0; }
  BitWriter.prototype.write = function (value, bits) {
    this.acc = ((this.acc << bits) | value) & 0xFFFFFFF; // cnt<=7 + 20 bits fits 28
    this.cnt += bits;
    while (this.cnt >= 8) {
      this.cnt -= 8;
      this.bytes.push((this.acc >> this.cnt) & 255);
    }
  };
  BitWriter.prototype.flush = function () {
    if (this.cnt > 0) {
      this.bytes.push((this.acc << (8 - this.cnt)) & 255);
      this.cnt = 0;
    }
  };

  function BitReader(bytes) { this.bytes = bytes; this.pos = 0; this.acc = 0; this.cnt = 0; }
  BitReader.prototype.read = function (bits) {
    while (this.cnt < bits) {
      if (this.pos >= this.bytes.length) return -1;
      this.acc = ((this.acc << 8) | this.bytes[this.pos++]) & 0xFFFFF;
      this.cnt += 8;
    }
    this.cnt -= bits;
    return (this.acc >> this.cnt) & ((1 << bits) - 1);
  };

  function u32le(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
  function readU32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  // Encode a recorded run. odos are ABSOLUTE cumulative distances (units);
  // deltas pack to 12 bits (max speed * 250ms = 3300 < 4096), playerX to 8 bits.
  // Layout: ver(1) seed(u32le) score(u32le) interval/10(u8) count(u16le) samples(20b each)
  function encodeGhost(seed, score, intervalMs, odos, xs) {
    if (!odos || !xs || odos.length !== xs.length || odos.length < 2) return null;
    var count = odos.length;
    if (count > 65535) return null;
    var iv = Math.round(intervalMs / 10);
    if (iv < 1 || iv > 255) return null;
    var w = new BitWriter();
    var i, d, xi;
    for (i = 0; i < count; i++) {
      d = Math.round(odos[i] - (i > 0 ? odos[i - 1] : 0));
      d = clamp(d, 0, 4095);
      xi = Math.round((clamp(xs[i], -2.6, 2.6) + 2.6) / GHOST_X_RANGE * 255);
      w.write(d, 12);
      w.write(clamp(xi, 0, 255), 8);
    }
    w.flush(); // pad the final partial byte so decode's length check matches
    var head = [GHOST_FMT_VERSION].concat(u32le(seed >>> 0)).concat(u32le(Math.max(0, Math.floor(score)))).
      concat([iv, count & 255, (count >> 8) & 255]);
    return bytesToB64url(head.concat(w.bytes));
  }

  // Never throws: any malformed input returns null (the app just plays ghostless).
  function decodeGhost(str) {
    try {
      var b = b64urlToBytes(str);
      if (!b || b.length < 12) return null;
      if (b[0] !== GHOST_FMT_VERSION) return null;
      var seed = readU32le(b, 1);
      var score = readU32le(b, 5);
      var intervalMs = b[9] * 10;
      if (intervalMs < 50) return null;
      var count = b[10] | (b[11] << 8);
      if (count < 2) return null;
      var expected = 12 + Math.ceil(count * 20 / 8);
      if (b.length !== expected) return null;
      var r = new BitReader(b);
      r.pos = 12;
      var odos = [], xs = [], prev = 0, i, d, xi;
      for (i = 0; i < count; i++) {
        d = r.read(12);
        xi = r.read(8);
        if (d < 0 || xi < 0) return null;
        prev += d;
        odos.push(prev);
        xs.push(xi / 255 * GHOST_X_RANGE - 2.6);
      }
      return { seed: seed, score: score, intervalMs: intervalMs, odos: odos, xs: xs };
    } catch (e) {
      return null;
    }
  }

  function createGame(opts) {
    opts = opts || {};
    var rng = opts.rng || function () { return 0.5; };
    var segments = buildTrack(rng);
    var cpEvery = segments.cpEvery;
    var trackLength = segments.length * SEGMENT_LENGTH;

    // optional rival ghost: purely observational, never touches physics
    var ghost = null;
    if (opts.ghost && typeof opts.ghost === 'object') {
      var go = opts.ghost;
      if (go.odos && go.xs && go.odos.length === go.xs.length && go.odos.length >= 2 &&
          typeof go.intervalMs === 'number' && go.intervalMs >= 50) {
        ghost = {
          intervalMs: go.intervalMs,
          odos: go.odos.slice(0),
          xs: go.xs.slice(0),
          score: Math.max(0, Math.floor(go.score || 0))
        };
      }
    }

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
      elapsed: 0,                // play-time ms since start (pauses excluded)
      input: { left: false, right: false },
      ghost: ghost,              // decoded rival ghost or null (observational)
      segments: segments,
      trackLength: trackLength,
      taken: {},                 // 'segIndex:objIndex' -> true, per run
      events: [],                // ['start'|'boost'|'spin'|'checkpoint'|'lap'|'over', ...]
      _rng: rng,
      _recOdos: [0],             // ghost recording: absolute odo per sample
      _recXs: [0],               //   matching playerX per sample
      _recAccum: 0
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

    // Rival ghost position at a given play-time. Returns {odo, x} while the
    // ghost's run is still going, null once it's past its last sample (the
    // ghost finished/gone) or when there is no ghost.
    function ghostAt(elapsedMs) {
      if (!ghost || typeof elapsedMs !== 'number' || !isFinite(elapsedMs) || elapsedMs < 0) return null;
      var n = ghost.odos.length;
      var lastT = (n - 1) * ghost.intervalMs;
      // tolerate one interval of frame-granularity overshoot past the ghost's
      // final sample before declaring it gone
      if (elapsedMs > lastT + ghost.intervalMs) return null;
      var f = elapsedMs / ghost.intervalMs;
      var i = Math.floor(f);
      if (i >= n - 1) return { odo: ghost.odos[n - 1], x: ghost.xs[n - 1] };
      var t = f - i;
      return {
        odo: ghost.odos[i] + (ghost.odos[i + 1] - ghost.odos[i]) * t,
        x: ghost.xs[i] + (ghost.xs[i + 1] - ghost.xs[i]) * t
      };
    }

    // Snapshot of the just-driven run for ghost encoding (copies).
    function getRecording() {
      return {
        intervalMs: REC_INTERVAL_MS,
        odos: g._recOdos.slice(0),
        xs: g._recXs.slice(0),
        score: g.score
      };
    }

    function update(dtMs) {
      if (g.state !== 'playing' || typeof dtMs !== 'number' || !isFinite(dtMs) || dtMs <= 0) return g;
      var dt = Math.min(dtMs, 100) / 1000;

      g.elapsed += dtMs;
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
          if (g.speed > cap) {
            // boosted accel outpaces bleed, so hold the hard cap while the
            // boost lasts; afterwards bleed any overshoot back to MAX_SPEED
            g.speed = g.boostTimer > 0 ? cap : Math.max(MAX_SPEED, g.speed - BOOST_DECAY * dt);
          }
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
      // ghost line recording: play-time only (pauses never reach update)
      g._recAccum += dtMs;
      var guard = 0;
      while (g._recAccum >= REC_INTERVAL_MS && g._recOdos.length < REC_MAX_SAMPLES && guard++ < 6) {
        g._recAccum -= REC_INTERVAL_MS;
        g._recOdos.push(g.odo);
        g._recXs.push(g.playerX);
      }
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
      g.elapsed = 0;
      g._recOdos = [0];
      g._recXs = [0];
      g._recAccum = 0;
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
    g.ghostAt = ghostAt;
    g.getRecording = getRecording;
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
      OBJ_HIT: OBJ_HIT, OBJ_PICKUP: OBJ_PICKUP,
      REC_INTERVAL_MS: REC_INTERVAL_MS, REC_MAX_SAMPLES: REC_MAX_SAMPLES
    };
    return g;
  }

  return {
    createGame: createGame,
    buildTrack: buildTrack,
    mulberry32: mulberry32,
    clamp: clamp,
    easeInOut: easeInOut,
    encodeGhost: encodeGhost,
    decodeGhost: decodeGhost,
    VERSION: '1.1.0'
  };
});
