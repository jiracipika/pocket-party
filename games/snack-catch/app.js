/* Pocket Party: Snack Catch — browser shell. Requires core.js loaded first. */
(function () {
  'use strict';

  var PG = window.PocketGame;
  if (!PG) return;

  var CANVAS_W = 360, CANVAS_H = 640, DPR_CAP = 1.5;
  var ACCENT = '#7dffb2', DANGER = '#ff6b6b';
  // Astra sprite atlas (games/snack-catch -> ../../assets/): 768x128, six
  // 128px cells: apple, donut, cookie, banana, bomb, basket. Pre-rasterized
  // PNG used directly on canvas; primitives remain the fallback until load.
  var SPRITE_URL = '../../assets/snack-sprites.png';
  var GRAIN_URL = '../../assets/ink-grain.png';
  var CELL = 128;                        // source cell size in the atlas
  var KIND_CELL = { apple: 0, donut: 1, cookie: 2, banana: 3, bomb: 4 };
  var BASKET_CELL = 5;
  // Aspect-safe sprite drawing. The canvas maps logical 360x640 onto a
  // differently-shaped CSS box with independent X/Y scale (setTransform), so a
  // square logical draw would come out stretched. We compensate by drawing at a
  // logical height of w * sx/sy (sy < sx => taller logical rect) so the sprite
  // stays square in SCREEN pixels without touching core hitboxes.
  // Source crop (atlas pixels, opaque content only, face+handle kept):
  var CROPS = { // [srcX, srcY, srcW, srcH] measured from the opaque alpha bbox
    snack: [4, 2, 120, 120],          // snacks: uniform ~centered square
    basket: [0, 36, 128, 92]          // basket: skip empty top padding; full
                                      // handle rows 36-42 + woven face
  };
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
    apple: ['#ff5b5b', '#c22e3f'],
    donut: ['#ffb0d8', '#e26aa5'],
    cookie: ['#e8b25c', '#a9713a'],
    banana: ['#ffe15c', '#d8a927'],
    bomb: ['#3a3a4a', '#14141c']
  };

  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var stage = document.getElementById('stage');

  var el = {
    score: document.getElementById('hudScore'),
    best: document.getElementById('hudBest'),
    time: document.getElementById('hudTime'),
    combo: document.getElementById('hudCombo'),
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
    recapCatches: document.getElementById('recapCatches'),
    recapMissed: document.getElementById('recapMissed'),
    recapBombs: document.getElementById('recapBombs'),
    recapCombo: document.getElementById('recapCombo'),
    recapBest: document.getElementById('recapBest'),
    srStatus: document.getElementById('srStatus')
  };

  // ---------- storage (guarded) ----------
  var bestKey = 'snack-catch-best';
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
    try { return window.localStorage.getItem('snack-catch-muted') === '1'; } catch (e) { return false; }
  }
  function saveMuted(m) {
    try { window.localStorage.setItem('snack-catch-muted', m ? '1' : '0'); } catch (e) { /* noop */ }
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
    catch: function (k) { blip(620 + (k.length % 3) * 80, 0.09, 'triangle', 0.12); },
    combo: function () { blip(520, 0.08, 'square', 0.09); blip(780, 0.1, 'square', 0.09, 0.07); },
    bomb: function () { blip(120, 0.28, 'sawtooth', 0.16); blip(70, 0.34, 'sawtooth', 0.12, 0.04); },
    miss: function () { blip(210, 0.1, 'sine', 0.06); },
    over: function () { blip(392, 0.12, 'triangle', 0.1); blip(294, 0.14, 'triangle', 0.1, 0.1); blip(196, 0.22, 'triangle', 0.1, 0.2); },
    start: function () { blip(440, 0.08, 'triangle', 0.09); blip(660, 0.1, 'triangle', 0.09, 0.06); }
  };

  // ---------- game state ----------
  var game = PG.createGame({ rng: PG.mulberry32((Math.random() * 0xffffffff) >>> 0) });
  game.best = loadBest();
  var particles = [];
  var raf = null, lastTs = 0, accMs = 0;
  var running = false;       // rAF loop on
  var started = false;       // has user begun the first round
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  var ITEM_DRAW = 30; // logical draw width (~2x ITEM_R, honest footprint)

  function drawItem(it) {
    // Sprite atlas first; primitives only until the atlas loads.
    if (sprites.ready && sprites.img) {
      var cell = KIND_CELL[it.kind];
      if (typeof cell === 'number') {
        var c = CROPS.snack;
        // square in screen pixels: logical height = w * (sx/sy)
        var hL = ITEM_DRAW * (sprites.sx / sprites.sy);
        ctx.drawImage(sprites.img, cell * CELL + c[0], c[1], c[2], c[3],
          it.x - ITEM_DRAW / 2, it.y - hL / 2, ITEM_DRAW, hL);
        return;
      }
    }
    var col = SNACK_COLORS[it.kind] || SNACK_COLORS.apple;
    if (it.kind === 'bomb') {
      ctx.fillStyle = col[1];
      ctx.beginPath(); ctx.arc(it.x, it.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col[0];
      ctx.beginPath(); ctx.arc(it.x - 4, it.y - 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(it.x + 6, it.y - 10); ctx.quadraticCurveTo(it.x + 14, it.y - 20, it.x + 8, it.y - 24); ctx.stroke();
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath(); ctx.arc(it.x + 8, it.y - 25, 3.4, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var r = 13;
    ctx.fillStyle = col[0];
    if (it.kind === 'apple') {
      ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col[1];
      ctx.fillRect(it.x - 1.5, it.y - r - 5, 3, 6);
    } else if (it.kind === 'donut') {
      ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#12121c';
      ctx.beginPath(); ctx.arc(it.x, it.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col[1];
      ctx.beginPath(); ctx.arc(it.x, it.y, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      for (var a = 0; a < 5; a++) {
        var ang = a * 1.257 + 0.4;
        ctx.fillRect(it.x + Math.cos(ang) * 6.5 - 1, it.y + Math.sin(ang) * 6.5 - 1, 2, 2);
      }
    } else if (it.kind === 'cookie') {
      ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col[1];
      ctx.beginPath(); ctx.arc(it.x - 4, it.y - 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(it.x + 5, it.y + 2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(it.x - 1, it.y + 6, 1.6, 0, Math.PI * 2); ctx.fill();
    } else { // banana
      ctx.strokeStyle = col[0];
      ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(it.x, it.y - 4, 9, 0.35, Math.PI - 0.35); ctx.stroke();
      ctx.strokeStyle = col[1];
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(it.x, it.y - 4, 12.5, 0.5, Math.PI - 0.5); ctx.stroke();
    }
    // gloss
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(it.x - 4, it.y - 5, 2.4, 0, Math.PI * 2); ctx.fill();
  }

  var BASKET_DRAW_W = 64; // screen-px target width (~60px at 360 viewport)

  function drawBasket(x) {
    var b = game.basket;
    var w = b.w + 8, h = b.h, top = b.y - h / 2;
    // Astra basket sprite (atlas cell 5), cropped to face+handle. Drawn with
    // aspect compensation (square in screen px) and anchored so the sprite's
    // mouth sits exactly on the core catch line (b.y - b.h/2).
    if (sprites.ready && sprites.img) {
      var r = CROPS.basket;
      // Aspect math (all logical units): dwL * sx = target screen width,
      // dhL * sy = dwL * sx * (r[3]/r[2])  ->  dhL = dwL * (sx/sy) * aspect.
      var dwL = BASKET_DRAW_W;
      var dhL = dwL * (sprites.sx / sprites.sy) * (r[3] / r[2]);
      // Anchor: sprite's mouth (src row 90 of the crop) sits on the catch line.
      var yTop = top - dhL * (90 / r[3]);
      ctx.drawImage(sprites.img, BASKET_CELL * CELL + r[0], r[1], r[2], r[3],
        x - dwL / 2, yTop, dwL, dhL);
      return;
    }
    // mint basket with weave stripes
    ctx.fillStyle = ACCENT;
    roundRect(ctx, x - w / 2, top, w, h, 8); ctx.fill();
    ctx.fillStyle = 'rgba(6, 40, 26, 0.5)';
    for (var i = 1; i < 4; i++) {
      ctx.fillRect(x - w / 2 + (w / 4) * i - 1.5, top + 3, 3, h - 6);
    }
    ctx.fillStyle = '#06281a';
    roundRect(ctx, x - w / 2 + 4, top + h - 8, w - 8, 5, 3); ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    // opaque night backdrop + cached ink-grain stipple (no gradients)
    ctx.fillStyle = '#10101c';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (sprites.grainPattern) {
      ctx.fillStyle = sprites.grainPattern;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    // faint vertical guides
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (var gx = 60; gx < CANVAS_W; gx += 60) ctx.fillRect(gx, 0, 1, CANVAS_H);

    for (var i = 0; i < game.items.length; i++) drawItem(game.items[i]);
    drawBasket(game.basket.x);

    for (var p = 0; p < particles.length; p++) {
      var pt = particles[p];
      ctx.globalAlpha = 1 - pt.t / pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (game.state === 'playing' && game.multiplier > 1) {
      ctx.fillStyle = ACCENT;
      ctx.font = '800 26px "Avenir Next", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('x' + game.multiplier + ' combo', CANVAS_W / 2, 44);
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
    el.time.textContent = String(Math.ceil(game.timeLeft / 1000));
    el.combo.textContent = 'x' + game.multiplier;
    el.hearts.textContent = fmtHearts(game.hearts);
  }
  function show(ov, on) { ov.classList.toggle('hidden', !on); }
  function announce(msg) { el.srStatus.textContent = msg; }

  // ---------- audio events from core ----------
  function playEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e[0] === 'catch') { sfx.catch(e[1]); burst(e[2], e[3], SNACK_COLORS[e[1]] ? SNACK_COLORS[e[1]][0] : ACCENT, 10); }
      else if (e[0] === 'combo') sfx.combo();
      else if (e[0] === 'bomb') { sfx.bomb(); burst(e[2], e[3], DANGER, 18, 130); }
      else if (e[0] === 'miss') sfx.miss();
      else if (e[0] === 'over') sfx.over();
      else if (e[0] === 'start') sfx.start();
    }
  }

  function endRound() {
    var newBest = game.score > game.best;
    if (newBest) { game.best = game.score; saveBest(game.best); }
    el.finalScore.textContent = String(game.score);
    el.recapCatches.textContent = String(game.catches);
    el.recapMissed.textContent = String(game.missed);
    el.recapBombs.textContent = String(game.bombsHit);
    el.recapCombo.textContent = 'x' + game.multiplier;
    el.recapBest.textContent = newBest && game.score > 0 ? 'Yes!' : 'No';
    show(el.ovOver, true);
    setPauseEnabled(false);
    announce('Round over. Score ' + game.score + '.');
  }

  function startRound() {
    try { var a = ac(); if (a && a.state === 'suspended') a.resume().catch(function(){}); } catch(e) {}
    game.start();
    accMs = 0;
    keys = {};
    pointerDown = false;
    particles.length = 0;
    show(el.ovStart, false);
    show(el.ovOver, false);
    show(el.ovPause, false);
    setPauseEnabled(true);
    ensureLoop();
    syncHud();
  }

  function setPauseEnabled(on) { el.btnPause.disabled = !on; el.btnPause.setAttribute('aria-pressed', 'false'); }

  function doPause() {
    keys = {}; pointerDown = false;
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
      while (accMs >= 16) { game.update(16); accMs -= 16; }
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

  function pointerX(clientX) {
    var r = cv.getBoundingClientRect();
    var t = (clientX - r.left) / r.width;
    return PG.clamp(t, 0, 1) * CANVAS_W;
  }

  var pointerDown = false;
  cv.addEventListener('pointerdown', function (e) {
    pointerDown = true;
    if (e.target === cv) { try { cv.setPointerCapture(e.pointerId); } catch (err) {} }
    game.setInput(pointerX(e.clientX));
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!pointerDown) return;
    game.setInput(pointerX(e.clientX));
    e.preventDefault();
  });
  window.addEventListener('pointerup', function () { pointerDown = false; });
  window.addEventListener('pointercancel', function () { pointerDown = false; });

  // ---------- keyboard ----------
  var keys = {};
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd' || k === 'A' || k === 'D') {
      keys[k.toLowerCase()] = true;
      e.preventDefault();
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game.state === 'playing') doPause();
      else if (game.state === 'paused') doResume();
      e.preventDefault();
    } else if (k === ' ' || k === 'Enter') {
      if (game.state === 'ready') { startRound(); e.preventDefault(); }
      else if (game.state === 'over') { startRound(); e.preventDefault(); }
      else if (game.state === 'paused') { doResume(); e.preventDefault(); }
    }
  });
  document.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  setInterval(function () {
    if (game.state !== 'playing') return;
    var dx = 0;
    if (keys['arrowleft'] || keys['a']) dx -= 260 / 60;
    if (keys['arrowright'] || keys['d']) dx += 260 / 60;
    if (dx) game.moveBasket(dx);
  }, 16);

  // ---------- buttons ----------
  el.btnStart.addEventListener('click', function () { started = true; startRound(); });
  el.btnReplay.addEventListener('click', function () { startRound(); });
  el.btnResume.addEventListener('click', doResume);
  el.btnPause.addEventListener('click', function () {
    if (game.state === 'playing') doPause(); else if (game.state === 'paused') doResume();
  });
  el.btnQuit.addEventListener('click', function () {
    game.timeLeft = 0; game.state = 'playing'; game.update(1); // force expire
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
    return 'I scored ' + game.score + ' in Snack Catch (best ' + game.best + ')! Can you beat me?';
  }
  el.btnShare.addEventListener('click', function () {
    var text = shareText() + ' ' + location.href.split('?')[0];
    if (navigator.share) {
      navigator.share({ title: 'Snack Catch', text: text }).catch(function () {});
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
          hearts: game.hearts, combo: game.combo, multiplier: game.multiplier,
          catches: game.catches, missed: game.missed, bombsHit: game.bombsHit,
          timeLeft: game.timeLeft, items: game.items.length,
          basketX: game.basket.x
        };
      },
      start: startRound,
      pause: doPause,
      resume: doResume,
      setInput: function (x) { game.setInput(x); },
      game: game,
      forceOver: function () { game.timeLeft = 0; game.update(1); endRound(); }
    };
  }

  // ---------- boot ----------
  resize();
  syncHud();
  show(el.ovStart, true);
  if (!reduceMotion) { /* idle attract: gentle canvas render only, no auto-start */ }
  draw();
})();
