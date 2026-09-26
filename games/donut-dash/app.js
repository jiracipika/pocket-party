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
    apple: '#ff5b5b', donut: '#ffb0d8', cookie: '#e8b25c', banana: '#ffe15c'
  };
  var OB_COLORS = { crate: '#e7a541', tall: '#f17c62', wide: '#bd9cff' };

  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var stage = document.getElementById('stage');

  var el = {
    score: document.getElementById('hudScore'),
    best: document.getElementById('hudBest'),
    dist: document.getElementById('hudDist'),
    hearts: document.getElementById('hudHearts'),
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
    hit: function () { blip(130, 0.22, 'sawtooth', 0.15); blip(85, 0.28, 'sawtooth', 0.11, 0.04); },
    over: function () { blip(392, 0.12, 'triangle', 0.1); blip(294, 0.14, 'triangle', 0.1, 0.1); blip(196, 0.22, 'triangle', 0.1, 0.2); },
    start: function () { blip(440, 0.08, 'triangle', 0.09); blip(660, 0.1, 'triangle', 0.09, 0.06); }
  };

  // ---------- game state ----------
  var game = PG.createGame({ rng: PG.mulberry32((Math.random() * 0xffffffff) >>> 0) });
  game.best = loadBest();
  var particles = [];
  var raf = null, lastTs = 0, accMs = 0;
  var running = false;       // rAF loop on
  var pointerDown = false;   // canvas touch in progress
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shakeT = 0;            // cosmetic hit shake, seconds left
  var dustAcc = 0;

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
    // blink during i-frames (cosmetic only)
    if (game.iframes > 0 && Math.floor(game.iframes * 10) % 2 === 0) return;
    var size = 44;
    var cx = p.x, cy = p.y - p.h / 2;
    var roll = game.x / 22; // rolling donut
    if (sprites.ready && sprites.img) {
      var c = CROP_SNACK;
      var hL = size * (sprites.sx / sprites.sy); // square in screen px
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(roll);
      ctx.drawImage(sprites.img, PLAYER_CELL * CELL + c[0], c[1], c[2], c[3],
        -size / 2, -hL / 2, size, hL);
      ctx.restore();
      return;
    }
    // primitive fallback: ink donut with sprinkle dashes
    ctx.save();
    ctx.translate(cx, cy);
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
  }
  function show(ov, on) { ov.classList.toggle('hidden', !on); }
  function announce(msg) { el.srStatus.textContent = msg; }

  // ---------- events from core ----------
  function playEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e[0] === 'jump') { if (e[1] === 2) sfx.jump2(); else sfx.jump(); }
      else if (e[0] === 'pickup') { sfx.pickup(); burst(e[2], e[3], SNACK_COLORS[e[1]] || ACCENT, 8); }
      else if (e[0] === 'hit') { sfx.hit(); burst(e[2], e[3] + 20, DANGER, 16, 130); shakeT = 0.18; }
      else if (e[0] === 'over') sfx.over();
      else if (e[0] === 'start') sfx.start();
    }
  }

  function endRound() {
    var newBest = game.score > game.best;
    if (newBest) { game.best = game.score; saveBest(game.best); }
    el.finalScore.textContent = String(game.score);
    el.recapDistance.textContent = game.meters + 'm';
    el.recapPickups.textContent = String(game.pickupsGot);
    el.recapHits.textContent = String(game.hits);
    el.recapJumps.textContent = String(game.jumpsUsed);
    el.recapBest.textContent = newBest && game.score > 0 ? 'Yes!' : 'No';
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
    shakeT = 0;
    show(el.ovStart, false);
    show(el.ovOver, false);
    show(el.ovPause, false);
    setPauseEnabled(true);
    ensureLoop();
    syncHud();
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
        game.update(16);
        accMs -= 16;
      }
      playEvents(game.takeEvents());
      if (game.state === 'over') endRound();
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
    el.btnMute.setAttribute('aria-pressed', String(audio.muted));
    el.btnMute.textContent = audio.muted ? '\u{1F507}' : '\u266B';
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.state === 'playing') doPause();
  });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  el.btnMute.setAttribute('aria-pressed', String(audio.muted));
  el.btnMute.textContent = audio.muted ? '\u{1F507}' : '\u266B';

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
          pickupsGot: game.pickupsGot, hits: game.hits, iframes: game.iframes
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
  show(el.ovStart, true);
  draw();
})();
