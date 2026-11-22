/* Pocket Party: Donut Dash — browser shell. Requires core.js loaded first. */
(function () {
  'use strict';

  var PG = window.PocketGame;
  if (!PG) return;

  var CANVAS_W = 360, CANVAS_H = 640, DPR_CAP = 1.5;
  var ACCENT = '#ff9a80', DANGER = '#ff6b6b';
  var GROUND_Y = 560;
  // Astra sprite atlas (games/donut-dash -> ../../assets/): 768x128, six
  // 128px cells: apple, donut, cookie, banana, bomb, basket. The donut cell
  // doubles as the rolling player; snacks are the pickups.
  var SPRITE_URL = '../../assets/snack-sprites.png';
  var GRAIN_URL = '../../assets/ink-grain.png';
  var CELL = 128;                        // source cell size in the atlas
  var KIND_CELL = { apple: 0, donut: 1, cookie: 2, banana: 3 };
  var PLAYER_CELL = 1;                   // donut
  // Source crop (atlas pixels, opaque content only):
  var CROP_SNACK = [4, 2, 120, 120];
  var sprites = { img: null, grain: null, grainPattern: null, ready: false };
  (function loadSprites() {
    var img = new Image();
    img.onload = function () { sprites.img = img; sprites.ready = true; };
    img.src = SPRITE_URL;
    var grain = new Image();
    grain.onload = function () {
      sprites.grain = grain;
      sprites.grainPattern = ctx.createPattern(grain, 'repeat'); // cached
    };
    grain.src = GRAIN_URL;
  })();
  var SNACK_COLORS = {
    apple: '#ff5b5b', donut: '#ffb0d8', cookie: '#e8b25c', banana: '#ffe15c',
    golden: '#ffd23f', shield: '#6ecbff', magnet: '#c9a0ff'
  };
  var OB_COLORS = { crate: '#e7a541', tall: '#f17c62', wide: '#bd9cff', spring: '#7dffb2' };

  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var stage = document.getElementById('stage');

  var el = {
    score: document.getElementById('hudScore'),
    best: document.getElementById('hudBest'),
    startBestLine: document.getElementById('startBestLine'),
    startBest: document.getElementById('startBest'),
    dist: document.getElementById('hudDist'),
    hearts: document.getElementById('hudHeartsVal'),
    chain: document.getElementById('hudChain'),
    shield: document.getElementById('hudShield'),
    ovStart: document.getElementById('ovStart'),
    ovPause: document.getElementById('ovPause'),
    ovOver: document.getElementById('ovOver'),
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnResume: document.getElementById('btnResume'),
    btnQuit: document.getElementById('btnQuit'),
    btnReplay: document.getElementById('btnReplay'),
    btnShare: document.getElementById('btnShare'),
    btnMute: document.getElementById('btnMute'),
    finalScore: document.getElementById('finalScore'),
    recapDistance: document.getElementById('recapDistance'),
    recapPickups: document.getElementById('recapPickups'),
    recapHits: document.getElementById('recapHits'),
    recapJumps: document.getElementById('recapJumps'),
    recapChain: document.getElementById('recapChain'),
    recapDelta: document.getElementById('recapDelta'),
    recapChart: document.getElementById('recapChart'),
    missionList: document.getElementById('missionList'),
    btnDaily: document.getElementById('btnDaily'),
    recapBest: document.getElementById('recapBest'),
    srStatus: document.getElementById('srStatus')
  };

  // ---------- storage (guarded) ----------
  var bestKey = 'donut-dash-best';
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

  // ---------- S5 meta: daily seed, history ring, missions (all local) ----------
  var META = window.DonutMeta;
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
  var bestMKey = 'donut-dash-best-m';
  var historyKey = 'donut-dash-history';
  var missionsKey = 'donut-dash-missions';
  var bestM = loadJSON(bestMKey, 0);
  if (typeof bestM !== 'number' || !isFinite(bestM) || bestM < 0) bestM = 0;
  var history = loadJSON(historyKey, []);
  var missionsDone = loadJSON(missionsKey, {});
  function renderMissions() {
    var html = '';
    for (var i = 0; i < META.MISSIONS.length; i++) {
      var m = META.MISSIONS[i];
      var done = !!missionsDone[m.id];
      html += '<li class="' + (done ? 'done' : 'open') + '"><span class="mission-mark">' +
        (done ? '\u2713' : '\u25CB') + '</span>' + m.label + '</li>';
    }
    el.missionList.innerHTML = html;
  }
  function renderChart() {
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      days.push(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2));
    }
    var byDay = {};
    for (var j = 0; j < history.length; j++) byDay[history[j].d] = history[j].m;
    var vals = [];
    for (var k = 0; k < days.length; k++) vals.push(byDay[days[k]] || 0);
    var max = 1;
    for (var k2 = 0; k2 < vals.length; k2++) if (vals[k2] > max) max = vals[k2];
    var WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    var bars = '';
    for (var b = 0; b < 7; b++) {
      var x = b * 20 + 5;
      var hgt = vals[b] > 0 ? Math.max(4, Math.round(vals[b] / max * 34)) : 3;
      var y = 40 - hgt;
      bars += '<rect x="' + x + '" y="' + y + '" width="12" height="' + hgt + '" rx="2" fill="' +
        (vals[b] > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.14)') + '"/>';
      var wd = new Date(days[b] + 'T12:00:00').getDay();
      bars += '<text x="' + (x + 6) + '" y="50" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.5)">' + WD[wd] + '</text>';
    }
    el.recapChart.innerHTML = '<svg viewBox="0 0 150 54" width="150" height="54" role="img" aria-label="Best distance, last 7 days">' + bars + '</svg>';
  }

  // ---------- audio (procedural, short) ----------
  var audio = { ctx: null, muted: loadMuted() };
  function loadMuted() {
    try { return window.localStorage.getItem('donut-dash-muted') === '1'; } catch (e) { return false; }
  }
  function saveMuted(m) {
    try { window.localStorage.setItem('donut-dash-muted', m ? '1' : '0'); } catch (e) { /* noop */ }
  }
  function ac() {
    if (!audio.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audio.ctx = new AC();
    }
    return audio.ctx;
  }
  function blip(freq, dur, type, gain, when) {
    if (audio.muted) return;
    var a = ac(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    var t = a.currentTime + (when || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var sfx = {
    jump: function () { blip(440, 0.09, 'triangle', 0.11); },
    jump2: function () { blip(660, 0.1, 'triangle', 0.11); blip(880, 0.08, 'triangle', 0.08, 0.05); },
    pickup: function () { blip(880, 0.07, 'sine', 0.1); blip(1320, 0.09, 'sine', 0.09, 0.06); },
    power: function () { blip(523, 0.08, 'sine', 0.11); blip(784, 0.09, 'sine', 0.1, 0.06); blip(1047, 0.12, 'sine', 0.09, 0.12); },
    spring: function () { blip(300, 0.06, 'square', 0.09); blip(720, 0.12, 'triangle', 0.11, 0.04); },
    shieldDown: function () { blip(392, 0.1, 'triangle', 0.11); blip(262, 0.16, 'triangle', 0.1, 0.07); },
    hit: function () { blip(130, 0.22, 'sawtooth', 0.15); blip(85, 0.28, 'sawtooth', 0.11, 0.04); },
    heart: function () { blip(76, 0.1, 'sine', 0.13); blip(60, 0.16, 'sine', 0.1, 0.17); },
    over: function () { blip(392, 0.12, 'triangle', 0.1); blip(294, 0.14, 'triangle', 0.1, 0.1); blip(196, 0.22, 'triangle', 0.1, 0.2); },
    start: function () { blip(440, 0.08, 'triangle', 0.09); blip(660, 0.1, 'triangle', 0.09, 0.06); }
  };

  // ---------- game state ----------
  var game = PG.createGame({ rng: PG.mulberry32((Math.random() * 0xffffffff) >>> 0) });
  game.best = loadBest();
  // start-card personal-best line (display-only, mirrors the stored best)
  el.startBest.textContent = String(game.best);
  if (game.best > 0) el.startBestLine.classList.remove('hidden');
  var particles = [];
  var raf = null, lastTs = 0, accMs = 0;
  var running = false;       // rAF loop on
  var pointerDown = false;   // canvas touch in progress
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shakeT = 0;            // cosmetic hit shake, seconds left
  var dustAcc = 0;
  var flashT = 0;            // red edge flash after a hit, seconds left
  var flipT = 0;             // double-jump flip spin, seconds left
  var landSquash = 0;        // 0..1 landing squash, decays each frame
  var heartT = 0;            // low-heart pulse timer (ms)
  var FLIP_T = 0.35;         // double-jump flip duration (s)
  var HIT_FLASH_T = 0.25;    // red edge flash duration (s)

  // ---------- particles ----------
  function burst(x, y, color, n, spread) {
    if (reduceMotion) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (spread || 90) * (0.4 + Math.random() * 0.8);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + Math.random() * 0.3, t: 0, color: color, r: 2 + Math.random() * 3 });
    }
  }
  function stepParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
    }
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (flashT > 0) flashT = Math.max(0, flashT - dt);
    if (flipT > 0) flipT = Math.max(0, flipT - dt);
    if (landSquash > 0) landSquash = Math.max(0, landSquash - dt * 4.5);
  }

  // Landing feedback: squash scaled by fall speed, dust puff at the feet
  // (dust is skipped under reduced motion; the squash stays but gentler).
  function onLand(vy) {
    var k = (vy - 200) / 1000;
    landSquash = k < 0.3 ? 0.3 : (k > 1 ? 1 : k);
    if (reduceMotion) return;
    var n = 4 + Math.round(landSquash * 4);
    for (var i = 0; i < n; i++) {
      particles.push({
        x: game.player.x + (Math.random() - 0.5) * 30, y: GROUND_Y - 2,
        vx: (Math.random() - 0.5) * 150, vy: -15 - Math.random() * 60,
        life: 0.3 + Math.random() * 0.25, t: 0,
        color: 'rgba(255,255,255,0.3)', r: 2 + Math.random() * 2.5
      });
    }
  }

  // Squash & stretch for the donut (cosmetic): stretch while rising, squash on
  // landing. Reduced motion keeps only a minimal landing squash.
  function playerDeform() {
    var sx = 1, sy = 1;
    if (landSquash > 0) {
      var k = reduceMotion ? 0.35 : 1;
      sy = 1 - 0.22 * landSquash * k;
      sx = 1 + 0.28 * landSquash * k;
    } else if (!reduceMotion && !game.player.onGround && game.player.vy < 0) {
      var st = Math.min(1, -game.player.vy / game.CONST.JUMP_V) * 0.14;
      sy = 1 + st; sx = 1 - st * 0.7;
    }
    return [sx, sy];
  }

  // ---------- drawing ----------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Deterministic backdrop sprinkle positions (no Math.random: stable frames)
  function sprinkle(i, w) { return ((i * 137.5) % (w + 40)) - 20; }

  // S5: personal-best distance ghost flag, rendered in-world until passed
  function drawGhostFlag() {
    if (!bestM || game.meters >= bestM) return;
    var sx = bestM * 32 - game.x;
    if (sx < -30 || sx > CANVAS_W + 30) return;
    var topY = GROUND_Y - 58;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, GROUND_Y);
    ctx.lineTo(sx, topY);
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.moveTo(sx, topY);
    ctx.lineTo(sx + 22, topY + 7);
    ctx.lineTo(sx, topY + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 9px "Avenir Next", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PB ' + bestM + 'm', sx, topY - 6);
  }

  function drawBackdrop() {
    // opaque night sky + cached ink-grain stipple
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (sprites.grainPattern) {
      ctx.fillStyle = sprites.grainPattern;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    // static far sprinkles (stars)
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (var i = 0; i < 14; i++) {
      var sx = sprinkle(i, CANVAS_W), sy = 40 + ((i * 83) % 380);
      ctx.fillRect(sx, sy, 2.5, 2.5);
    }
    // parallax hills, two depths
    var off;
    ctx.fillStyle = '#1c1630';
    off = (game.x * 0.35) % 180;
    for (var a = -1; a < 4; a++) {
      ctx.beginPath();
      ctx.arc(a * 180 - off + 60, GROUND_Y + 30, 110, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = '#262040';
    off = (game.x * 0.6) % 140;
    for (var b = -1; b < 4; b++) {
      ctx.beginPath();
      ctx.arc(b * 140 - off + 40, GROUND_Y + 46, 82, Math.PI, 0);
      ctx.fill();
    }
    // ground band + scrolling dashes
    ctx.fillStyle = '#241d2e';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
    ctx.fillStyle = '#332a47';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    var dashOff = game.x % 48;
    for (var d = -1; d < CANVAS_W / 48 + 1; d++) {
      ctx.fillRect(d * 48 - dashOff, GROUND_Y + 18, 26, 4);
    }
  }

  function drawPlayer() {
    var p = game.player;
    // gentle i-frame blink: dim to 35% instead of vanishing (cosmetic only)
    var blinkA = 1;
    if (game.iframes > 0 && Math.floor(game.iframes * 8) % 2 === 1) blinkA = 0.35;
    var size = 44;
    var cx = p.x, cy = p.y - p.h / 2;
    var roll = game.x / 22; // rolling donut
    // extra full spin on the double jump, easing out (net 2*PI: no pop)
    if (flipT > 0) roll += Math.PI * 2 * (1 - (flipT / FLIP_T) * (flipT / FLIP_T));
    var df = playerDeform(), sx = df[0], sy = df[1];
    if (sprites.ready && sprites.img) {
      var c = CROP_SNACK;
      var hL = size * (sprites.sx / sprites.sy); // square in screen px
      ctx.save();
      ctx.globalAlpha = blinkA;
      ctx.translate(cx, cy);
      if (sx !== 1 || sy !== 1) { // squash/stretch anchored at the feet
        ctx.translate(0, hL / 2);
        ctx.scale(sx, sy);
        ctx.translate(0, -hL / 2);
      }
      ctx.rotate(roll);
      ctx.drawImage(sprites.img, PLAYER_CELL * CELL + c[0], c[1], c[2], c[3],
        -size / 2, -hL / 2, size, hL);
      ctx.restore();
      return;
    }
    // primitive fallback: ink donut with sprinkle dashes
    ctx.save();
    ctx.globalAlpha = blinkA;
    ctx.translate(cx, cy);
    if (sx !== 1 || sy !== 1) {
      ctx.translate(0, size / 2);
      ctx.scale(sx, sy);
      ctx.translate(0, -size / 2);
    }
    ctx.rotate(roll);
    ctx.fillStyle = '#ffb0d8';
    ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14101c';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e26aa5';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (var k = 0; k < 6; k++) {
      var ang = k * 1.047;
      ctx.fillRect(Math.cos(ang) * 16 - 1.2, Math.sin(ang) * 16 - 1.2, 2.4, 2.4);
    }
    ctx.restore();
  }

  function drawObstacle(ob) {
    var x = ob.x - game.x;
    if (x + ob.w < -20 || x > CANVAS_W + 20) return;
    var col = OB_COLORS[ob.kind] || OB_COLORS.crate;
    ctx.fillStyle = col;
    roundRect(ctx, x, ob.y, ob.w, ob.h, 6); ctx.fill();
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth = 4;
    roundRect(ctx, x, ob.y, ob.w, ob.h, 6); ctx.stroke();
    if (ob.kind === 'spring') { // coil mark instead of the plank cross
      ctx.strokeStyle = '#0a0a0f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (var sy = 8; sy <= ob.h - 8; sy += 7) {
        ctx.moveTo(x + 8, ob.y + sy);
        ctx.lineTo(x + ob.w - 8, ob.y + Math.min(sy + 5, ob.h - 8));
      }
      ctx.stroke();
      return;
    }
    // plank cross
    ctx.beginPath();
    ctx.moveTo(x + 5, ob.y + 5); ctx.lineTo(x + ob.w - 5, ob.y + ob.h - 5);
    ctx.moveTo(x + ob.w - 5, ob.y + 5); ctx.lineTo(x + 5, ob.y + ob.h - 5);
    ctx.lineWidth = 3;
    ctx.stroke();
    if (ob.hit) { // cracked after a crash
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + ob.w * 0.3, ob.y + 4);
      ctx.lineTo(x + ob.w * 0.5, ob.y + ob.h * 0.5);
      ctx.lineTo(x + ob.w * 0.38, ob.y + ob.h - 4);
      ctx.stroke();
    }
  }

  var PICKUP_DRAW = 24;

  function drawPickup(pk) {
    var x = pk.x - game.x;
    if (x < -20 || x > CANVAS_W + 20) return;
    var bob = Math.sin(game.x * 0.05 + pk.x * 0.05) * 3;
    var y = pk.y + bob;
    if (sprites.ready && sprites.img) {
      var cell = KIND_CELL[pk.kind];
      if (typeof cell === 'number') {
        var c = CROP_SNACK;
        var hL = PICKUP_DRAW * (sprites.sx / sprites.sy);
        ctx.drawImage(sprites.img, cell * CELL + c[0], c[1], c[2], c[3],
          x - PICKUP_DRAW / 2, y - hL / 2, PICKUP_DRAW, hL);
        return;
      }
    }
    ctx.fillStyle = SNACK_COLORS[pk.kind] || SNACK_COLORS.cookie;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
    // S4 specials get a white glyph so they read as more than snacks
    if (pk.kind === 'golden') {
      ctx.strokeStyle = '#fff6c9'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
      ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
      ctx.stroke();
    } else if (pk.kind === 'shield') {
      ctx.fillStyle = '#e8f6ff';
      ctx.beginPath();
      ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y - 3); ctx.lineTo(x + 5, y + 2);
      ctx.lineTo(x, y + 6); ctx.lineTo(x - 5, y + 2); ctx.lineTo(x - 5, y - 3);
      ctx.closePath(); ctx.fill();
    } else if (pk.kind === 'magnet') {
      ctx.strokeStyle = '#efe6ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y + 1, 4.5, Math.PI, 0, false); ctx.stroke();
      ctx.fillStyle = '#efe6ff';
      ctx.fillRect(x - 6, y + 1, 2.5, 4);
      ctx.fillRect(x + 3.5, y + 1, 2.5, 4);
    }
  }

  function draw() {
    var shakeX = 0, shakeY = 0;
    if (shakeT > 0) {
      shakeX = (Math.random() - 0.5) * 8 * shakeT / 0.18;
      shakeY = (Math.random() - 0.5) * 8 * shakeT / 0.18;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackdrop();
    drawGhostFlag();
    for (var i = 0; i < game.pickups.length; i++) drawPickup(game.pickups[i]);
    for (var j = 0; j < game.obstacles.length; j++) drawObstacle(game.obstacles[j]);
    drawPlayer();
    for (var p = 0; p < particles.length; p++) {
      var pt = particles[p];
      ctx.globalAlpha = 1 - pt.t / pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // red edge flash on crash (drawn unshaken so the edges stay covered)
    if (flashT > 0) {
      var fa = flashT / HIT_FLASH_T;
      ctx.save();
      ctx.lineWidth = 34;
      ctx.strokeStyle = 'rgba(255,90,90,' + (0.5 * fa).toFixed(3) + ')';
      ctx.strokeRect(-9, -9, CANVAS_W + 18, CANVAS_H + 18);
      ctx.lineWidth = 70;
      ctx.strokeStyle = 'rgba(255,90,90,' + (0.22 * fa).toFixed(3) + ')';
      ctx.strokeRect(-22, -22, CANVAS_W + 44, CANVAS_H + 44);
      ctx.restore();
    }
  }

  // ---------- HUD ----------
  function fmtHearts(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '\u2665' : '\u2661';
    return s;
  }
  function syncHud() {
    el.score.textContent = String(game.score);
    el.best.textContent = String(game.best);
    el.dist.textContent = game.meters + 'm';
    el.hearts.textContent = fmtHearts(game.hearts);
    el.chain.hidden = game.chainMult <= 1;
    el.chain.textContent = 'x' + game.chainMult;
    el.shield.hidden = !game.shield;
  }
  function show(ov, on) { ov.classList.toggle('hidden', !on); }
  function announce(msg) { el.srStatus.textContent = msg; }

  // ---------- events from core ----------
  function playEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e[0] === 'jump') {
        if (e[1] === 2) { // distinct double-jump tell: flip spin + spark ring
          sfx.jump2();
          if (!reduceMotion) flipT = FLIP_T;
          burst(game.player.x, game.player.y - 26, '#ffffff', 6, 150);
          burst(game.player.x, game.player.y - 26, ACCENT, 5, 100);
        } else sfx.jump();
      }
      else if (e[0] === 'pickup') {
        if (e[1] === 'shield' || e[1] === 'magnet') {
          sfx.power();
          burst(e[2], e[3], SNACK_COLORS[e[1]] || ACCENT, 12);
          burst(e[2], e[3], '#ffffff', 5, 150);
        } else {
          sfx.pickup();
          burst(e[2], e[3], SNACK_COLORS[e[1]] || ACCENT, e[4] >= 3 ? 14 : (e[4] >= 2 ? 10 : 8));
          burst(e[2], e[3], '#ffffff', 4, 150); // white sparkle over the snack burst
        }
      }
      else if (e[0] === 'spring') { sfx.spring(); burst(e[2], e[3], '#7dffb2', 10); }
      else if (e[0] === 'shield-used') { sfx.shieldDown(); burst(e[2], e[3], '#6ecbff', 14, 130); }
      else if (e[0] === 'hit') { sfx.hit(); burst(e[2], e[3] + 20, DANGER, 16, 130); shakeT = 0.18; flashT = HIT_FLASH_T; }
      else if (e[0] === 'over') sfx.over();
      else if (e[0] === 'start') sfx.start();
    }
  }

  function endRound() {
    var newBest = game.score > game.best;
    if (newBest) { game.best = game.score; saveBest(game.best); }
    // S5 meta: best-distance delta, 7-day history, missions (local only)
    var prevBestM = bestM;
    if (game.meters > bestM) { bestM = game.meters; saveJSON(bestMKey, bestM); }
    history = META.pushHistory(history, dateStamp(), game.meters);
    saveJSON(historyKey, history);
    var run = { meters: game.meters, hits: game.hits, bestChain: game.bestChain, dayKey: dateStamp() };
    missionsDone = META.evaluateMissions(missionsDone, run);
    saveJSON(missionsKey, missionsDone);
    renderMissions();
    el.finalScore.textContent = String(game.score);
    el.recapDistance.textContent = game.meters + 'm';
    el.recapPickups.textContent = String(game.pickupsGot);
    el.recapHits.textContent = String(game.hits);
    el.recapJumps.textContent = String(game.jumpsUsed);
    el.recapChain.textContent = 'x' + game.bestChain;
    if (prevBestM > 0 && game.meters > prevBestM) {
      el.recapDelta.textContent = '+' + (game.meters - prevBestM) + 'm over best';
      el.recapDelta.classList.add('is-new-best');
    } else if (prevBestM > 0) {
      el.recapDelta.textContent = 'best ' + prevBestM + 'm';
      el.recapDelta.classList.remove('is-new-best');
    } else {
      el.recapDelta.textContent = '\u2014';
      el.recapDelta.classList.remove('is-new-best');
    }
    renderChart();
    el.recapBest.textContent = newBest && game.score > 0 ? 'Yes!' : 'No';
    el.recapBest.classList.toggle('is-new-best', newBest && game.score > 0);
    show(el.ovOver, true);
    setPauseEnabled(false);
    announce('Run over. Score ' + game.score + '.');
  }

  function startRound() {
    try { var a = ac(); if (a && a.state === 'suspended') a.resume().catch(function(){}); } catch(e) {}
    game.start();
    accMs = 0;
    pointerDown = false;
    particles.length = 0;
    shakeT = 0; flashT = 0; flipT = 0; landSquash = 0; heartT = 0;
    show(el.ovStart, false);
    show(el.ovOver, false);
    show(el.ovPause, false);
    setPauseEnabled(true);
    ensureLoop();
    syncHud();
  }

  // S5: same-seed-for-everyone daily run; the date string is hashed in the
  // pure meta module so the core never sees a clock.
  function startDailyRound() {
    game = PG.createGame({ rng: PG.mulberry32(META.seedFromDate(dateStamp())) });
    game.best = loadBest();
    if (window.__gameTest) window.__gameTest.game = game;
    startRound();
  }

  function setPauseEnabled(on) { el.btnPause.disabled = !on; el.btnPause.setAttribute('aria-pressed', 'false'); }

  function doPause() {
    pointerDown = false;
    if (game.pause() === 'paused') {
      show(el.ovPause, true);
      el.btnPause.setAttribute('aria-pressed', 'true');
    }
  }
  function doResume() {
    if (game.resume() === 'playing') {
      show(el.ovPause, false);
      el.btnPause.setAttribute('aria-pressed', 'false');
      ensureLoop();
    }
  }

  // ---------- main loop ----------
  function ensureLoop() {
    if (running) return;
    running = true;
    lastTs = 0;
    raf = window.requestAnimationFrame(loop);
  }
  function loop(ts) {
    raf = null;
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(ts - lastTs, 100); // clamp tab-switch jumps
    lastTs = ts;

    if (game.state === 'playing') {
      accMs += dt;
      while (accMs >= 16) {
        // running dust (cosmetic)
        dustAcc += 16;
        if (!reduceMotion && game.player.onGround && dustAcc > 90) {
          dustAcc = 0;
          particles.push({ x: game.player.x - 12, y: GROUND_Y - 3, vx: -60 - Math.random() * 40, vy: -30 - Math.random() * 30, life: 0.4, t: 0, color: 'rgba(255,255,255,0.25)', r: 2.5 });
        }
        var wasAir = !game.player.onGround, vyBefore = game.player.vy;
        game.update(16);
        accMs -= 16;
        if (wasAir && game.player.onGround) onLand(vyBefore); // landing squash + dust
      }
      playEvents(game.takeEvents());
      if (game.state === 'over') endRound();
      else if (game.hearts === 1) { // low-heart pulse (cosmetic)
        heartT += dt;
        if (heartT >= 900) { heartT = 0; sfx.heart(); }
      } else heartT = 0;
    }
    stepParticles(dt / 1000);
    draw();
    syncHud();

    if (game.state === 'playing' || particles.length > 0) {
      raf = window.requestAnimationFrame(loop);
    } else {
      running = false;
    }
  }

  // ---------- canvas sizing / pointer mapping ----------
  function resize() {
    var rect = stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.max(320, Math.min(Math.round(cssW * CANVAS_H / CANVAS_W), window.innerHeight - rect.top - 18));
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    ctx.setTransform(cv.width / CANVAS_W, 0, 0, cv.height / CANVAS_H, 0, 0);
    sprites.sx = cv.width / CANVAS_W;   // stored for aspect-correct drawImage
    sprites.sy = cv.height / CANVAS_H;
    draw();
  }

  cv.addEventListener('pointerdown', function (e) {
    if (game.state === 'playing') {
      game.jump();
      e.preventDefault();
    }
  });

  // ---------- keyboard ----------
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
      if (game.state === 'playing') {
        if (!e.repeat) game.jump();
      } else if (game.state === 'ready' || game.state === 'over') {
        startRound();
      } else if (game.state === 'paused') {
        doResume();
      }
      e.preventDefault();
    } else if (k === 'Enter') {
      if (game.state === 'ready' || game.state === 'over') { startRound(); e.preventDefault(); }
      else if (game.state === 'paused') { doResume(); e.preventDefault(); }
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game.state === 'playing') doPause();
      else if (game.state === 'paused') doResume();
      e.preventDefault();
    }
  });

  // ---------- buttons ----------
  el.btnStart.addEventListener('click', function () { startRound(); });
  el.btnReplay.addEventListener('click', function () { startRound(); });
  el.btnDaily.addEventListener('click', function () { startDailyRound(); });
  el.btnResume.addEventListener('click', doResume);
  el.btnPause.addEventListener('click', function () {
    if (game.state === 'playing') doPause(); else if (game.state === 'paused') doResume();
  });
  el.btnQuit.addEventListener('click', function () {
    game.endRun();
    show(el.ovPause, false);
    endRound();
  });
  el.btnMute.addEventListener('click', function () {
    audio.muted = !audio.muted;
    saveMuted(audio.muted);
    // glyph stays ♪; muted state is carried by aria-pressed styling (shared meta language)
    el.btnMute.setAttribute('aria-pressed', String(audio.muted));
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.state === 'playing') doPause();
  });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  el.btnMute.setAttribute('aria-pressed', String(audio.muted));

  // ---------- share ----------
  function shareText() {
    return 'I ran ' + game.meters + 'm for ' + game.score + ' points in Donut Dash (best ' + game.best + ')! Can you beat me?';
  }
  el.btnShare.addEventListener('click', function () {
    var text = shareText() + ' ' + location.href.split('?')[0];
    if (navigator.share) {
      navigator.share({ title: 'Donut Dash', text: text }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        el.btnShare.textContent = 'Copied!';
        setTimeout(function () { el.btnShare.textContent = 'Share Score'; }, 1400);
      }, function () { fallbackPrompt(text); });
    } else {
      fallbackPrompt(text);
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
          hearts: game.hearts, time: game.time, meters: game.meters,
          speed: game.speed, jumpsUsed: game.jumpsUsed,
          onGround: game.player.onGround, playerY: game.player.y,
          obstacles: game.obstacles.length, pickups: game.pickups.length,
          pickupsGot: game.pickupsGot, hits: game.hits, iframes: game.iframes,
          chain: game.chain, bestChain: game.bestChain, chainMult: game.chainMult,
          shield: game.shield, magnetT: game.magnetT
        };
      },
      start: startRound,
      pause: doPause,
      resume: doResume,
      jump: function () { game.jump(); },
      game: game,
      forceOver: function () { game.endRun(); endRound(); }
    };
  }

  // ---------- boot ----------
  resize();
  syncHud();
  renderMissions();
  show(el.ovStart, true);
  draw();
})();
