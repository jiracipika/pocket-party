/* Pocket Party: Turbo Kart — browser app.
 * Renders the deterministic core (core.js): auto-throttle kart racing, hold
 * left/right (or tap) to steer, checkpoints for time, bananas spin you out,
 * boost boxes raise the cap. All rules live in the core; this file draws the
 * pseudo-3D road and routes input. */
(function () {
  'use strict';

  var PG = window.PocketGame;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var CANVAS_W = 360, CANVAS_H = 640;
  var ACCENT = '#ffb03f';

  // ---- pseudo-3D projection constants ----
  var ROAD_WIDTH = 2100;       // half-width in world units
  var CAMERA_HEIGHT = 1050;
  var CAMERA_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
  var DRAW_DISTANCE = 95;
  var KART_Y = CANVAS_H - 88;

  var el = {
    score: document.getElementById('hudScore'),
    best: document.getElementById('hudBest'),
    time: document.getElementById('hudTime'),
    lap: document.getElementById('hudLap'),
    boost: document.getElementById('hudBoost'),
    timeChip: document.getElementById('timeChip'),
    startBestLine: document.getElementById('startBestLine'),
    startBest: document.getElementById('startBest'),
    ovStart: document.getElementById('ovStart'),
    ovPause: document.getElementById('ovPause'),
    ovOver: document.getElementById('ovOver'),
    btnStart: document.getElementById('btnStart'),
    btnDaily: document.getElementById('btnDaily'),
    btnPause: document.getElementById('btnPause'),
    btnResume: document.getElementById('btnResume'),
    btnQuit: document.getElementById('btnQuit'),
    btnReplay: document.getElementById('btnReplay'),
    btnShare: document.getElementById('btnShare'),
    btnMute: document.getElementById('btnMute'),
    hudGhost: document.getElementById('hudGhost'),
    ghostLine: document.getElementById('ghostLine'),
    ghostScoreEl: document.getElementById('ghostScore'),
    finalScore: document.getElementById('finalScore'),
    recapGhostRow: document.getElementById('recapGhostRow'),
    recapGhost: document.getElementById('recapGhost'),
    recapDistance: document.getElementById('recapDistance'),
    recapSpeed: document.getElementById('recapSpeed'),
    recapCheckpoints: document.getElementById('recapCheckpoints'),
    recapLaps: document.getElementById('recapLaps'),
    recapBananas: document.getElementById('recapBananas'),
    recapBoosts: document.getElementById('recapBoosts'),
    recapBest: document.getElementById('recapBest'),
    srStatus: document.getElementById('srStatus')
  };

  // ---------- storage (guarded) ----------
  var bestKey = 'turbo-kart-best';
  function loadBest() {
    try {
      var v = window.localStorage.getItem(bestKey);
      var n = v === null ? NaN : Number(v);
      return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    } catch (e) { return 0; }
  }
  function saveBest(n) {
    try { window.localStorage.setItem(bestKey, String(n)); } catch (e) { /* private mode */ }
  }
  function loadMuted() {
    try { return window.localStorage.getItem('turbo-kart-muted') === '1'; } catch (e) { return false; }
  }
  function saveMuted(m) {
    try { window.localStorage.setItem('turbo-kart-muted', m ? '1' : '0'); } catch (e) { /* noop */ }
  }

  // ---------- meta (daily seed + history ring; local only) ----------
  var META = window.TurboMeta;
  function dateStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function loadJSON(key, fallback) {
    try {
      var v = window.localStorage.getItem(key);
      if (v === null) return fallback;
      var parsed = JSON.parse(v);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }
  var historyKey = 'turbo-kart-best-history'; // name contains 'best': the suite persistence gate watches it
  var history = loadJSON(historyKey, []);
  if (!Array.isArray(history)) history = [];
  var prevBestAtRoundStart = loadBest();

  // ---------- audio (procedural, short) ----------
  var audio = { ctx: null, muted: loadMuted() };
  function ac() {
    if (!audio.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { audio.ctx = new AC(); } catch (e) { return null; }
    }
    return audio.ctx;
  }
  function blip(freq, dur, type, gain, when, glideTo) {
    if (audio.muted) return;
    var a = ac(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    var t = a.currentTime + (when || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(gain || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var sfx = {
    start: function () { blip(440, 0.08, 'triangle', 0.09); blip(660, 0.1, 'triangle', 0.09, 0.06); blip(880, 0.12, 'triangle', 0.09, 0.12); },
    boost: function () { blip(300, 0.28, 'sawtooth', 0.09, 0, 980); },
    spin: function () { blip(420, 0.3, 'sawtooth', 0.12, 0, 70); blip(180, 0.16, 'square', 0.08, 0.05); },
    check: function () { blip(660, 0.09, 'sine', 0.11); blip(990, 0.14, 'sine', 0.1, 0.07); },
    lap: function () { blip(523, 0.08, 'triangle', 0.1); blip(659, 0.08, 'triangle', 0.1, 0.07); blip(784, 0.14, 'triangle', 0.1, 0.14); },
    over: function () { blip(392, 0.12, 'triangle', 0.1); blip(294, 0.14, 'triangle', 0.1, 0.1); blip(196, 0.22, 'triangle', 0.1, 0.2); }
  };

  // ---------- game state ----------
  function makeGame(seed, ghostData) {
    var opts = { rng: PG.mulberry32(seed >>> 0) };
    if (ghostData) opts.ghost = ghostData;
    var g = PG.createGame(opts);
    g.best = loadBest();
    return g;
  }
  // Ghost challenge from a shared Snap link: ?g=<code> (or #g=...). Any bad
  // payload decodes to null and the game just boots ghostless.
  function ghostFromUrl() {
    var m = window.location.search.match(/[?&]g=([A-Za-z0-9\-_]+)/);
    if (!m && window.location.hash) m = window.location.hash.match(/g=([A-Za-z0-9\-_]+)/);
    return m ? PG.decodeGhost(m[1]) : null;
  }
  var ghostBoot = ghostFromUrl();
  var currentSeed = ghostBoot ? ghostBoot.seed : (Math.random() * 0xffffffff) >>> 0;
  var game = makeGame(currentSeed, ghostBoot);
  el.startBest.textContent = String(game.best);
  if (game.best > 0) el.startBestLine.classList.remove('hidden');
  if (ghostBoot) {
    el.ghostLine.classList.remove('hidden');
    el.ghostScoreEl.textContent = String(ghostBoot.score);
    el.btnStart.textContent = 'Race the Ghost';
  }

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var raf = null, lastTs = 0;
  var running = false;
  var shakeT = 0;
  var popups = [];            // {text, t, life, color, big}
  var bgOffset = 0;           // parallax shift driven by accumulated curve
  var boostSfxUntil = 0;      // avoid retriggering the boost sweep every frame
  var spinPhase = 0;

  // ---------- input: hold sides / tap pulses / keyboard ----------
  var kbL = false, kbR = false;
  var holdL = false, holdR = false;   // live pointer holds
  var nudgeDir = 0, nudgeMs = 0;      // a quick tap keeps steering briefly
  var NUDGE_MS = 280;
  var activePointers = {};            // pointerId -> 'left' | 'right'

  function applyInput() {
    var left = kbL || holdL || (nudgeDir < 0 && nudgeMs > 0);
    var right = kbR || holdR || (nudgeDir > 0 && nudgeMs > 0);
    game.setInput(left, right);
  }
  function sideOf(e) {
    var rect = cv.getBoundingClientRect();
    return (e.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
  }
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    running = true; ensureLoop();
    if (game.state !== 'playing') return;
    var side = sideOf(e);
    activePointers[e.pointerId] = side;
    if (side === 'left') holdL = true; else holdR = true;
    nudgeDir = side === 'left' ? -1 : 1;
    nudgeMs = NUDGE_MS;
    applyInput();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!(e.pointerId in activePointers)) return;
    var side = sideOf(e);
    if (activePointers[e.pointerId] !== side) {
      activePointers[e.pointerId] = side;
      recomputeHolds();
      nudgeDir = side === 'left' ? -1 : 1;
      nudgeMs = NUDGE_MS;
      applyInput();
    }
  });
  function recomputeHolds() {
    holdL = false; holdR = false;
    for (var k in activePointers) {
      if (activePointers[k] === 'left') holdL = true; else holdR = true;
    }
  }
  function releasePointer(e) {
    if (e.pointerId in activePointers) {
      delete activePointers[e.pointerId];
      recomputeHolds();
      applyInput();
    }
  }
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { kbL = true; applyInput(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { kbR = true; applyInput(); }
    else if (e.code === 'KeyP') { if (game.state === 'playing') doPause(); else if (game.state === 'paused') doResume(); }
    else if (e.code === 'KeyM') { toggleMute(); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { kbL = false; applyInput(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { kbR = false; applyInput(); }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.state === 'playing') doPause();
  });

  // ---------- canvas sizing ----------
  var stage = document.getElementById('stage');
  function resize() {
    var rect = stage.getBoundingClientRect();
    var dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(rect.width));
    // fit the viewport height on short/landscape screens (sibling behavior)
    var h = Math.max(320, Math.min(Math.round(w * CANVAS_H / CANVAS_W), window.innerHeight - rect.top - 18));
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(cv.width / CANVAS_W, 0, 0, cv.height / CANVAS_H, 0, 0);
  }
  window.addEventListener('resize', resize);

  // ---------- HUD ----------
  function syncHud() {
    el.score.textContent = String(game.score);
    el.best.textContent = String(Math.max(game.best, game.score));
    var secs = Math.ceil(game.timeLeft / 1000);
    el.time.textContent = String(secs);
    el.timeChip.classList.toggle('time-low', secs <= 5 && game.state === 'playing');
    el.lap.textContent = String(game.lap + 1);
    if (game.state === 'playing' && game.boostTimer > 0.05) {
      el.boost.hidden = false;
      el.boost.textContent = '\u26A1 ' + game.boostTimer.toFixed(1);
    } else {
      el.boost.hidden = true;
    }
    // rival ghost gap chip
    if (game.ghost && game.state === 'playing') {
      var ga = game.ghostAt(game.elapsed);
      if (ga) {
        var diffM = Math.round((game.odo - ga.odo) / 100);
        el.hudGhost.hidden = false;
        el.hudGhost.textContent = '\uD83C\uDFC1 ' + (diffM >= 0 ? '+' : '\u2212') + Math.abs(diffM) + 'm';
        el.hudGhost.classList.toggle('ahead', diffM >= 0);
        el.hudGhost.classList.toggle('behind', diffM < 0);
      } else {
        el.hudGhost.hidden = true;
      }
    } else {
      el.hudGhost.hidden = true;
    }
  }

  function popup(text, color, big) {
    // stack simultaneous popups so a banana + boost in the same stretch
    // don't overwrite each other
    popups.push({ text: text, t: 0, life: 1.0, color: color || '#ffffff', big: !!big, slot: popups.length % 3 });
  }

  // ---------- projection ----------
  var sprX = new Array(DRAW_DISTANCE), sprY = new Array(DRAW_DISTANCE),
      sprW = new Array(DRAW_DISTANCE), sprS = new Array(DRAW_DISTANCE),
      sprClip = new Array(DRAW_DISTANCE), sprCX = new Array(DRAW_DISTANCE);

  function drawBackdrop() {
    var bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H * 0.55);
    bg.addColorStop(0, '#131c33');
    bg.addColorStop(0.7, '#31456e');
    bg.addColorStop(1, '#5f6f96');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); // road overdraws below the horizon
    // sun
    ctx.fillStyle = 'rgba(255,214,120,0.9)';
    ctx.beginPath();
    ctx.arc(CANVAS_W * 0.68 - bgOffset * 0.2, 196, 30, 0, Math.PI * 2);
    ctx.fill();
    // far ridge + near hills, parallax against steering
    ctx.fillStyle = '#2c3c60';
    drawRidge(282, 0.5, 240);
    ctx.fillStyle = '#22304e';
    drawRidge(304, 0.85, 150);
  }
  function drawRidge(baseY, amp, wavelength) {
    var off = bgOffset * amp;
    ctx.beginPath();
    ctx.moveTo(0, baseY + 40);
    for (var x = 0; x <= CANVAS_W; x += 10) {
      var y = baseY - (Math.sin((x + off) / wavelength) * 16 + Math.sin((x + off) / (wavelength * 0.37) + 2) * 9) * amp - 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(CANVAS_W, baseY + 40);
    ctx.closePath();
    ctx.fill();
  }

  function project(rx, worldY, worldZ, camX, camY, camZ) {
    var scale = CAMERA_DEPTH / (worldZ - camZ);
    return {
      x: CANVAS_W / 2 + scale * (rx - camX) * CANVAS_W / 2,
      y: CANVAS_H / 2 - scale * (worldY - camY) * CANVAS_H / 2,
      w: scale * ROAD_WIDTH * CANVAS_W / 2,
      scale: scale
    };
  }

  function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  function drawSegment(p1, p2, idx) {
    var rumble = Math.floor(idx / game.CONST.RUMBLE_LENGTH) % 2 === 0;
    var grass = rumble ? '#175838' : '#13502f';
    var road = rumble ? '#3d3d49' : '#43434f';
    var strip = rumble ? '#c14a52' : '#e8e6e3';
    // grass band
    ctx.fillStyle = grass;
    ctx.fillRect(0, p2.y, CANVAS_W, p1.y - p2.y);
    var r1 = p1.w / 6, r2 = p2.w / 6;
    poly(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, strip);
    poly(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, strip);
    poly(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, road);
    if (rumble) { // lane dividers on alternating stripes
      var l1 = p1.w / 22, l2 = p2.w / 22;
      poly(p1.x - p1.w / 3 - l1, p1.y, p1.x - p1.w / 3 + l1, p1.y, p2.x - p2.w / 3 + l2, p2.y, p2.x - p2.w / 3 - l2, p2.y, '#8b8b98');
      poly(p1.x + p1.w / 3 - l1, p1.y, p1.x + p1.w / 3 + l1, p1.y, p2.x + p2.w / 3 + l2, p2.y, p2.x + p2.w / 3 - l2, p2.y, '#8b8b98');
    }
  }

  function drawBanana(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.5);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = Math.max(1.5, size * 0.32);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -size * 0.2, size, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = Math.max(1, size * 0.1);
    ctx.beginPath();
    ctx.arc(0, -size * 0.2, size * 1.04, Math.PI * 0.55, Math.PI * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  function drawBoostBox(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ff8c2f';
    var s = size;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#7a3a08';
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); // lightning bolt
    ctx.moveTo(-s * 0.08, -s * 0.38);
    ctx.lineTo(s * 0.16, -s * 0.06);
    ctx.lineTo(s * 0.02, -s * 0.02);
    ctx.lineTo(s * 0.14, s * 0.38);
    ctx.lineTo(-s * 0.14, s * 0.02);
    ctx.lineTo(s * 0.0, -s * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCheckpointArch(p, idx) {
    var rumble = Math.floor(idx / game.CONST.RUMBLE_LENGTH) % 2 === 0;
    if (!rumble) return; // arch posts straddle the segment; draw once per stripe pair
    var x = p.x, w = p.w * 1.25, y = p.y;
    var poleW = Math.max(1.5, w * 0.035);
    var top = y - w * 0.72;
    ctx.fillStyle = '#e8e6e3';
    ctx.fillRect(x - w - poleW, top, poleW, y - top);
    ctx.fillRect(x + w, top, poleW, y - top);
    // checkered banner
    var bh = Math.max(3, w * 0.14);
    var cells = 8;
    for (var i = 0; i < cells; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#111117' : '#f2f0ec';
      ctx.fillRect(x - w + (i * 2 * w) / cells, top - bh, (2 * w) / cells, bh);
    }
  }

  function drawKart() {
    var speedPct = game.speed / game.CONST.MAX_SPEED;
    var steer = (game.input.right ? 1 : 0) - (game.input.left ? 1 : 0);
    var spinning = game.spinTimer > 0;
    var t = performance.now() / 1000;
    var bounce = reduceMotion ? 0 : Math.sin(t * 26) * 1.7 * speedPct;
    var cx = CANVAS_W / 2 + steer * 7 + (spinning && !reduceMotion ? Math.sin(spinPhase * 23) * 4 : 0);
    var cy = KART_Y + bounce;
    ctx.save();
    ctx.translate(cx, cy);
    // shadow stays screen-stable; only the kart rocks
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 26, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    var rot = spinning && !reduceMotion ? Math.sin(spinPhase * 10) * 0.5 : steer * 0.1;
    ctx.rotate(rot);
    // exhaust flames shoot down-screen from the rear when boosted
    if (game.boostTimer > 0 && !reduceMotion) {
      var fl = 12 + Math.sin(t * 42) * 5;
      ctx.fillStyle = '#ff8c2f';
      ctx.beginPath();
      ctx.moveTo(-24, 14); ctx.lineTo(-30 - fl * 0.5, 30); ctx.lineTo(-12, 22); ctx.closePath();
      ctx.moveTo(24, 14); ctx.lineTo(30 + fl * 0.5, 30); ctx.lineTo(12, 22); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(-20, 16); ctx.lineTo(-24 - fl * 0.3, 27); ctx.lineTo(-12, 21); ctx.closePath();
      ctx.moveTo(20, 16); ctx.lineTo(24 + fl * 0.3, 27); ctx.lineTo(12, 21); ctx.closePath();
      ctx.fill();
    }
    // rear wheels
    ctx.fillStyle = '#14141a';
    ctx.fillRect(-32, 4, 12, 18);
    ctx.fillRect(20, 4, 12, 18);
    ctx.fillStyle = '#3c3c48';
    ctx.fillRect(-30, 8, 8, 4);
    ctx.fillRect(22, 8, 8, 4);
    // kart body
    ctx.fillStyle = '#d24343';
    ctx.strokeStyle = '#7c1f1f';
    ctx.lineWidth = 2;
    roundRect(-22, -8, 44, 26, 8, true, true);
    ctx.fillStyle = '#a83232';
    roundRect(-16, 10, 32, 9, 4, true, false); // rear bumper
    // penguin driver
    ctx.fillStyle = '#20242e';
    ctx.beginPath();
    ctx.ellipse(0, -14, 15, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f2ee';
    ctx.beginPath();
    ctx.ellipse(0, -10, 9.5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-5, -22, 4.6, 0, Math.PI * 2); ctx.arc(5, -22, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14141a';
    var look = steer * 1.8;
    ctx.beginPath(); ctx.arc(-5 + look, -22, 2.1, 0, Math.PI * 2); ctx.arc(5 + look, -22, 2.1, 0, Math.PI * 2); ctx.fill();
    // beak
    ctx.fillStyle = '#ff9a3d';
    ctx.beginPath();
    ctx.moveTo(-4, -16); ctx.lineTo(4, -16); ctx.lineTo(0, -11);
    ctx.closePath();
    ctx.fill();
    // helmet stripe
    ctx.fillStyle = ACCENT;
    ctx.fillRect(-15, -27, 30, 4);
    ctx.restore();
  }

  // translucent rival kart, drawn from the shared ghost trace (road-relative
  // x, world z from cumulative odo). Projected directly against the road
  // pass's cached curve centers; at the camera plane it renders side-by-side
  // with the player, Mario-Kart style.
  function drawGhostKart() {
    if (!game.ghost || game.state !== 'playing') return;
    var ga = game.ghostAt(game.elapsed);
    if (!ga) return;
    var SEGLEN = game.CONST.SEGMENT_LENGTH;
    var len = game.segments.length;
    var position = game.position;
    var base = Math.floor(position / SEGLEN);
    var baseSeg = game.segments[base];
    var basePct = (position % SEGLEN) / SEGLEN;
    var playerY = baseSeg.y1 + (baseSeg.y2 - baseSeg.y1) * basePct;
    var camX = game.playerX * ROAD_WIDTH;
    var camY = playerY + CAMERA_HEIGHT;

    var gseg = Math.floor((ga.odo % game.trackLength) / SEGLEN);
    var frac = (ga.odo % SEGLEN) / SEGLEN;
    var z = gseg * SEGLEN + frac * SEGLEN;
    if (gseg < base) z += game.trackLength;
    var zRel = z - position;
    var n = (gseg - base + len) % len;

    var sx, sy, size;
    if (zRel > -400 && zRel < 160) {
      // at/behind the bumper: render side-by-side at the player's scale
      sx = CANVAS_W / 2 + (ga.x - game.playerX) * CANVAS_W * 0.42;
      sy = KART_Y + 10;
      size = 26;
    } else {
      if (n <= 0 || n >= DRAW_DISTANCE - 1) return;
      var seg = game.segments[gseg];
      var cx = sprCX[n] + (sprCX[n + 1] - sprCX[n]) * frac;
      var wy = seg.y1 + (seg.y2 - seg.y1) * frac;
      var p = project(cx, wy, z, camX, camY, position);
      if (!(p.scale > 0) || p.y >= sprClip[n]) return; // behind camera or a crest
      size = Math.max(6, p.w * 0.11);
      sx = p.x + ga.x * p.w;
      // just ahead of the bumper the road surface projects below the frame:
      // keep the kart emerging from the bottom edge instead of vanishing
      sy = Math.min(p.y, CANVAS_H - size * 0.5);
    }
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.translate(sx, sy);
    ctx.fillStyle = '#cfd6e6';
    roundRect(-size * 0.8, -size * 0.55, size * 1.6, size * 0.9, size * 0.3, true, false);
    ctx.fillStyle = '#9aa5bd';
    ctx.fillRect(-size * 1.05, 0, size * 0.42, size * 0.6);
    ctx.fillRect(size * 0.63, 0, size * 0.42, size * 0.6);
    ctx.fillStyle = '#e8edf8';
    ctx.beginPath();
    ctx.arc(0, -size * 0.75, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d8aa8';
    ctx.fillRect(-size * 0.4, -size * 1.05, size * 0.8, size * 0.16);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r, fill, stroke) {    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawSpeedLines() {
    var speedPct = game.speed / game.CONST.MAX_SPEED;
    var boosting = game.boostTimer > 0;
    if ((speedPct < 0.9 && !boosting) || reduceMotion) return;
    // edge-anchored streaks angled away from the vanishing point, road area
    // only (vertical lines higher up read as rain)
    var n = boosting ? 7 : 4;
    var t = performance.now() / 90;
    ctx.strokeStyle = 'rgba(255,255,255,' + (boosting ? 0.28 : 0.15) + ')';
    ctx.lineWidth = 2;
    var yMin = CANVAS_H * 0.56;
    for (var i = 0; i < n; i++) {
      var seed = i * 131 + Math.floor(t) * 29;
      var side = i % 2 === 0 ? -1 : 1;
      var x = CANVAS_W / 2 + side * (CANVAS_W * 0.30 + (seed % 46));
      var y = yMin + (seed * 17) % 180;
      var len = boosting ? 56 : 32;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * len * 0.45, y + len);
      ctx.stroke();
    }
  }

  // ---------- render ----------
  function draw() {
    var shakeX = 0, shakeY = 0;
    if (shakeT > 0 && !reduceMotion) {
      shakeX = (Math.random() - 0.5) * 12 * (shakeT / 0.25);
      shakeY = (Math.random() - 0.5) * 12 * (shakeT / 0.25);
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackdrop();

    var segs = game.segments, len = segs.length;
    var SEGLEN = game.CONST.SEGMENT_LENGTH;
    var position = game.position;
    var base = Math.floor(position / SEGLEN);
    var basePct = (position % SEGLEN) / SEGLEN;
    var baseSeg = segs[base];
    var playerY = baseSeg.y1 + (baseSeg.y2 - baseSeg.y1) * basePct;
    var camX = game.playerX * ROAD_WIDTH;
    var camY = playerY + CAMERA_HEIGHT;
    var camZ = position;
    var x = 0, dx = -(baseSeg.curve * basePct);
    var maxY = CANVAS_H;

    for (var n = 0; n < DRAW_DISTANCE; n++) {
      var idx = (base + n) % len;
      var seg = segs[idx];
      var z1 = idx * SEGLEN, z2 = z1 + SEGLEN;
      if (idx < base) { z1 += game.trackLength; z2 += game.trackLength; }
      var p1 = project(x, seg.y1, z1, camX, camY, camZ);
      var p2 = project(x + dx, seg.y2, z2, camX, camY, camZ);
      sprX[n] = p1.x; sprY[n] = p1.y; sprW[n] = p1.w; sprS[n] = p1.scale;
      sprClip[n] = maxY; sprCX[n] = x;
      x += dx; dx += seg.curve;
      if (z1 - camZ <= 1 || p2.y >= maxY || p1.y <= p2.y) continue;
      drawSegment(p1, p2, idx);
      maxY = p2.y;
    }

    // sprites + arches, far to near
    for (var m = DRAW_DISTANCE - 1; m > 0; m--) {
      var sIdx = (base + m) % len;
      var s2 = segs[sIdx];
      var sy = sprY[m], sx = sprX[m], sw = sprW[m];
      if (!(sy > 0 && sy < CANVAS_H) || sprS[m] <= 0) continue;
      if (!s2.checkpoint && s2.objs.length === 0) continue;
      // A sprite's base projects to exactly its segment's clip y (same world
      // y and z as the previous segment's far edge), so the old
      // `sy >= sprClip[m]` cull rejected every sprite on visible road —
      // bananas, boost boxes and checkpoint arches never rendered. Clip-crop
      // instead: bases on the crest draw their body above it, and what sits
      // below a hill's crest line stays hidden.
      var clipY = sprClip[m];
      if (clipY > sy || clipY <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, CANVAS_W, clipY);
      ctx.clip();
      if (s2.checkpoint) drawCheckpointArch({ x: sx, y: sy, w: sw }, sIdx);
      for (var k = 0; k < s2.objs.length; k++) {
        if (game.taken[sIdx + ':' + k]) continue;
        var o = s2.objs[k];
        var ox = sx + o.x * sw;
        if (o.type === 'banana') drawBanana(ox, sy, Math.max(2.5, sw * 0.07));
        else drawBoostBox(ox, sy, Math.max(4, sw * 0.12));
      }
      ctx.restore();
    }

    drawSpeedLines();
    drawGhostKart();
    drawKart();

    for (var q = 0; q < popups.length; q++) {
      var pu = popups[q];
      var fade = 1 - pu.t / pu.life;
      ctx.globalAlpha = fade;
      ctx.fillStyle = pu.color;
      ctx.font = (pu.big ? '800 26px' : '700 17px') + ' "Avenir Next", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pu.text, CANVAS_W / 2, CANVAS_H * 0.4 - pu.slot * 36 - pu.t * 40);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- main loop ----------
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(50, ts - (lastTs || ts));
    lastTs = ts;
    if (running && game.state === 'playing') {
      if (nudgeMs > 0) nudgeMs -= dt;
      applyInput();
      game.update(dt);
      if (game.spinTimer > 0 && !reduceMotion) spinPhase += dt / 1000 * 13;
      playEvents(game.takeEvents());
    }
    var dtS = dt / 1000;
    for (var j = popups.length - 1; j >= 0; j--) {
      popups[j].t += dtS;
      if (popups[j].t >= popups[j].life) popups.splice(j, 1);
    }
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dtS);
    var speedPct = game.speed / game.CONST.MAX_SPEED;
    bgOffset += (game.segments[Math.floor(game.position / game.CONST.SEGMENT_LENGTH) % game.segments.length].curve) * speedPct * dtS * 34;
    syncHud();
    draw();
  }
  function ensureLoop() {
    if (raf === null) { lastTs = 0; raf = requestAnimationFrame(frame); }
  }

  // ---------- events from core ----------
  function playEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e[0] === 'boost') {
        sfx.boost();
        popup('+' + game.CONST.BOOST_POINTS + ' \u26A1', '#ffd23f', true);
        announce('Boost picked up.');
      } else if (e[0] === 'spin') {
        sfx.spin();
        popup('BANANA!', '#ff6b6b', true);
        if (!reduceMotion) shakeT = 0.25;
        announce('Hit a banana! Spinning out.');
      } else if (e[0] === 'checkpoint') {
        sfx.check();
        popup('+' + Math.round(game.CONST.CHECKPOINT_BONUS_MS / 1000) + 's CHECKPOINT', '#7dffb2', true);
        announce('Checkpoint: ' + Math.round(game.CONST.CHECKPOINT_BONUS_MS / 1000) + ' more seconds.');
      } else if (e[0] === 'lap') {
        sfx.lap();
        popup('LAP ' + e[1] + '  +' + game.CONST.LAP_POINTS, ACCENT, true);
        announce('Lap ' + e[1] + '!');
      } else if (e[0] === 'over') {
        sfx.over();
        endRound();
      } else if (e[0] === 'start') {
        sfx.start();
      }
    }
  }

  function endRound() {
    var newBest = game.score > game.best;
    if (newBest) { game.best = game.score; saveBest(game.best); }
    history = META.pushHistory(history, dateStamp(), game.score);
    saveJSON(historyKey, history);
    el.finalScore.textContent = String(game.score);
    el.recapDistance.textContent = (Math.round(game.distance / 100)).toLocaleString() + ' m';
    el.recapSpeed.textContent = Math.round(game.topSpeed * 0.036) + ' km/h';
    el.recapCheckpoints.textContent = String(game.checkpoints);
    el.recapLaps.textContent = String(game.lap);
    el.recapBananas.textContent = String(game.bananasHit);
    el.recapBoosts.textContent = String(game.boostsTaken);
    if (game.ghost) {
      el.recapGhostRow.hidden = false;
      var diff = game.score - game.ghost.score;
      if (diff > 0) {
        el.recapGhost.textContent = 'Won by ' + diff + '!';
        el.recapGhost.classList.add('is-new-best');
      } else if (diff < 0) {
        el.recapGhost.textContent = 'Lost by ' + (-diff);
        el.recapGhost.classList.remove('is-new-best');
      } else {
        el.recapGhost.textContent = 'Tie!';
        el.recapGhost.classList.add('is-new-best');
      }
    } else {
      el.recapGhostRow.hidden = true;
    }
    el.recapBest.textContent = newBest && game.score > 0 ? 'Yes!' : 'No';
    el.recapBest.classList.toggle('is-new-best', newBest && game.score > 0);
    show(el.ovOver, true);
    setPauseEnabled(false);
    announce('Race over. Score ' + game.score + '.');
  }

  // Daily time trial: everyone gets the same seeded track for the date.
  function startDailyRound() {
    ghostBoot = null;
    currentSeed = META.seedFromDate(dateStamp());
    game = makeGame(currentSeed, null);
    el.ghostLine.classList.add('hidden');
    el.btnStart.textContent = 'Start Race';
    if (window.__gameTest) window.__gameTest.game = game;
    startRound();
  }

  // ---------- ghost sharing: your run rides in the link ----------
  function buildShareUrl() {
    var rec = game.getRecording();
    var code = null;
    if (rec.odos.length >= 2 && rec.score > 0) {
      code = PG.encodeGhost(currentSeed >>> 0, rec.score, rec.intervalMs, rec.odos, rec.xs);
      if (code && code.length > 1600 && rec.odos.length >= 4) {
        // halve the trace if the code outgrew share-friendly size
        var odos = [], xs = [], i;
        for (i = 0; i < rec.odos.length; i += 2) { odos.push(rec.odos[i]); xs.push(rec.xs[i]); }
        if (odos.length >= 2) code = PG.encodeGhost(currentSeed >>> 0, rec.score, rec.intervalMs * 2, odos, xs);
      }
    }
    var base = window.location.href.split('?')[0].split('#')[0];
    return base + '?g=' + (code || '');
  }

  function startRound() {
    try { var a = ac(); if (a && a.state === 'suspended') a.resume().catch(function () {}); } catch (e) {}
    game.start();
    popups.length = 0;
    shakeT = 0;
    spinPhase = 0;
    nudgeDir = 0; nudgeMs = 0;
    holdL = false; holdR = false;
    activePointers = {};
    running = true;
    show(el.ovStart, false);
    show(el.ovOver, false);
    show(el.ovPause, false);
    setPauseEnabled(true);
    ensureLoop();
    syncHud();
  }

  function setPauseEnabled(on) { el.btnPause.disabled = !on; el.btnPause.setAttribute('aria-pressed', 'false'); }
  function doPause() {
    if (game.pause() === 'paused') {
      show(el.ovPause, true);
      el.btnPause.setAttribute('aria-pressed', 'true');
      game.setInput(false, false);
    }
  }
  function doResume() {
    if (game.resume() === 'playing') {
      show(el.ovPause, false);
      el.btnPause.setAttribute('aria-pressed', 'false');
    }
  }
  function show(ov, on) { ov.classList.toggle('hidden', !on); }
  function announce(msg) { el.srStatus.textContent = msg; }

  // ---------- buttons ----------
  el.btnStart.addEventListener('click', function () { startRound(); });
  el.btnDaily.addEventListener('click', function () { startDailyRound(); });
  el.btnReplay.addEventListener('click', function () { startRound(); });
  el.btnResume.addEventListener('click', function () { doResume(); });
  el.btnQuit.addEventListener('click', function () { game.endRun(); endRound(); });
  el.btnPause.addEventListener('click', function () { if (game.state === 'playing') doPause(); });

  function toggleMute() {
    audio.muted = !audio.muted;
    saveMuted(audio.muted);
    el.btnMute.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  }
  el.btnMute.addEventListener('click', toggleMute);
  if (audio.muted) el.btnMute.setAttribute('aria-pressed', 'true');

  // share with honest fallbacks
  function shareText() {
    var text = game.ghost
      ? 'Race my ghost \u2014 I scored ' + game.score + ' in Turbo Kart. Can you beat me?'
      : 'I scored ' + game.score + ' in Turbo Kart';
    if (!game.ghost && game.topSpeed > 0) text += ' (top speed ' + Math.round(game.topSpeed * 0.036) + ' km/h)';
    if (!game.ghost) text += ' \u2014 Pocket Party. Can you beat it?';
    return text;
  }
  el.btnShare.addEventListener('click', function () {
    var text = shareText();
    var url = buildShareUrl();
    if (navigator.share) {
      navigator.share({ title: 'Turbo Kart', text: text, url: url }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + ' ' + url).then(function () {
        announce('Copied to clipboard.');
      }, function () { fallbackPrompt(text + ' ' + url); });
    } else {
      fallbackPrompt(text + ' ' + url);
    }
  });
  function fallbackPrompt(text) {
    window.prompt('Copy your score:', text);
  }

  // ---------- QA hook (only with ?qa=1) ----------
  if (window.location.search.indexOf('qa=1') !== -1) {
    window.__gameTest = {
      getState: function () {
        return {
          state: game.state, score: game.score, best: game.best,
          timeLeft: game.timeLeft, speed: Math.round(game.speed),
          playerX: Math.round(game.playerX * 1000) / 1000,
          position: Math.round(game.position), lap: game.lap,
          checkpoints: game.checkpoints, bananasHit: game.bananasHit,
          boostsTaken: game.boostsTaken,
          boostTimer: Math.round(game.boostTimer * 100) / 100,
          spinTimer: Math.round(game.spinTimer * 100) / 100,
          offroad: game.offroad, distance: Math.round(game.distance),
          elapsed: Math.round(game.elapsed),
          ghost: game.ghost ? { score: game.ghost.score, samples: game.ghost.odos.length } : null,
          input: { left: game.input.left, right: game.input.right }
        };
      },
      start: startRound,
      setInput: function (l, r) { game.setInput(l, r); },
      pause: doPause,
      resume: doResume,
      game: game,
      buildShareUrl: buildShareUrl,
      forceOver: function () { game.endRun(); endRound(); }
    };
  }

  // ---------- boot ----------
  resize();
  syncHud();
  show(el.ovStart, true);
  draw();
})();

  // Visible build stamp: a stale tab keeps the previous game code until a
  // reload, so show which deploy this is (see the invisible-bananas fix).
  fetch('/build-info.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (info) {
      if (!info || !info.commit) return;
      var el = document.getElementById('buildRev');
      if (el) el.textContent = 'rev ' + String(info.commit).slice(0, 7);
    })
    .catch(function () {});
