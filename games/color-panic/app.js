/**
 * Color Panic — browser app. Uses the SAME tested core (core.js, UMD ->
 * window.PocketGame) that the Node tests and the Lens adapter run.
 * Script load order in index.html: core.js BEFORE app.js.
 */
(function () {
  'use strict';

  var PG = window.PocketGame;
  var COLORS = PG.COLORS;
  var LOCKOUT = PG.PRESS_LOCKOUT;
  var ROUND_TIME = PG.ROUND_TIME;

  var qaMode = /(^|[?&])qa=1(&|$)/.test(window.location.search);

  /* ---------- cached image assets (non-blocking; primitives until loaded) ---------- */
  var ASSETS = {
    symbols: '../../assets/color-symbols.svg', // 256x64: red tri, green circle, blue square, yellow diamond
    inkGrain: '../../assets/ink-grain.svg'     // 64x64 dark opaque tile
  };
  var images = { symbols: null, inkGrain: null, loaded: false };
  (function loadAssets() {
    var pending = 0;
    function done() {
      pending -= 1;
      if (pending === 0) images.loaded = true;
    }
    Object.keys(ASSETS).forEach(function (key) {
      pending += 1;
      var img = new Image();
      img.onload = function () { images[key] = img; done(); };
      img.onerror = done; // fallback to primitives
      img.src = ASSETS[key];
    });
  })();

  /** Draw color symbol i from the cached sprite sheet, or fall back to primitives. */
  function drawSymbolCue(idx, cx, cy, size) {
    var img = images.symbols;
    if (img) {
      // sheet frames are 64x64 with the glyph roughly within a 58x58 box
      var src = idx * 64, inset = 5, box = 64 - inset * 2;
      ctx.drawImage(img, src + inset, inset, box, box, cx - size, cy - size, size * 2, size * 2);
      return;
    }
    ctx.beginPath();
    drawSymbol(COLORS[idx].symbol, cx, cy, size);
    ctx.fillStyle = COLORS[idx].hex;
    ctx.fill();
  }
  /** Tiled opaque ink-grain backdrop (fallback: flat panel). */
  function drawGrain(x, y, w, h) {
    var img = images.inkGrain;
    if (!img) { ctx.fillStyle = '#12121d'; ctx.fillRect(x, y, w, h); return; }
    ctx.fillStyle = ctx.createPattern(img, 'repeat');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /* ---------- DOM ---------- */
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreVal');
  var bestEl = document.getElementById('bestVal');
  var heartsEl = document.getElementById('heartsVal');
  var roundEl = document.getElementById('roundVal');
  var comboEl = document.getElementById('comboPop');
  var startBtn = document.getElementById('startBtn');
  var pauseBtn = document.getElementById('pauseBtn');
  var resumeBtn = document.getElementById('resumeBtn');
  var muteBtn = document.getElementById('muteBtn');
  var shareBtn = document.getElementById('shareBtn');
  var shareBtn2 = document.getElementById('shareBtn2');
  var shareStatus = document.getElementById('shareStatus');
  var replayBtn = document.getElementById('replayBtn');
  var overlay = document.getElementById('overlay');
  var finalScore = document.getElementById('finalScore');
  var finalCombo = document.getElementById('finalCombo');
  var finalBest = document.getElementById('finalBest');
  var newBest = document.getElementById('newBest');
  var overTitle = document.getElementById('overTitle');
  var startBestLine = document.getElementById('startBestLine');
  var startBest = document.getElementById('startBest');

  /* ---------- guarded localStorage ---------- */
  var BEST_KEY = 'color-panic-best';
  var best = 0;
  try {
    var stored = window.localStorage.getItem(BEST_KEY);
    if (stored !== null) best = parseInt(stored, 10) || 0;
  } catch (e) { /* storage unavailable */ }
  function saveBest(v) {
    best = v;
    try { window.localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
  }
  // start-card personal best (display-only, mirrors the HUD best chip)
  if (best > 0 && startBestLine && startBest) {
    startBest.textContent = String(best);
    startBestLine.classList.remove('hidden');
  }

  /* ---------- game ---------- */
  var game = PG.createGame({ random: Math.random });

  /* ---------- audio (short procedural SFX, muted by toggle) ---------- */
  var muted = false;
  var audioCtx = null;
  function beep(freq, dur, type, gain) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type || 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.08, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch (e) { /* audio unavailable */ }
  }
  var sfx = {
    good: function (combo) {
      var tier = combo >= 8 ? 120 : combo >= 5 ? 60 : 0; // pitch steps per tier
      beep(440 + Math.min(combo, 8) * 60 + tier, 0.12, 'triangle', 0.09);
    },
    bad: function () { beep(150, 0.22, 'sawtooth', 0.07); },
    expire: function () { beep(110, 0.3, 'square', 0.06); },
    over: function () { beep(220, 0.4, 'sine', 0.08); },
    start: function () { beep(660, 0.1, 'triangle', 0.07); }
  };

  /* ---------- particles ---------- */
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* ignore */ }
  var particles = [];
  function burst(hex, x, y, n) {
    if (reduceMotion) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 180;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.6 + Math.random() * 0.3, age: 0,
        size: 3 + Math.random() * 5, hex: hex
      });
    }
  }

  /* ---------- juice: ring shockwaves, red flash, token transition ---------- */
  var rings = []; // expanding hit rings { x, y, age, life, start, grow, width, hex, bright }
  function ringBurst(hex, x, y, combo) {
    if (reduceMotion) return;
    var count = combo >= 8 ? 3 : combo >= 5 ? 2 : 1; // layers stack with combo
    var grow = combo >= 8 ? 68 : combo >= 5 ? 54 : combo >= 3 ? 44 : 32;
    var bright = combo >= 8 ? 1 : combo >= 5 ? 0.8 : combo >= 3 ? 0.65 : 0.5;
    for (var i = 0; i < count; i++) {
      rings.push({
        x: x, y: y,
        age: -i * 0.07, // stagger the layered rings
        life: 0.3 + i * 0.06,
        start: 16, grow: grow,
        width: 2.5 + i * 1.5 + (combo >= 8 ? 1.5 : 0),
        hex: hex, bright: bright
      });
    }
  }
  var BAD_FLASH_T = 0.28; // red edge vignette fade time after a wrong tap
  var badFlash = 0;
  var TOKEN_IN_T = 0.18;    // fresh-target scale-in duration
  var TOKEN_TRICKY_T = 0.5; // confusable targets double-pulse, longer
  var tokenAnim = 0;
  var tokenTricky = false;
  var lastTargetIndex = -1;
  /** Token scale for the spawn transition; confusable ones pulse twice. */
  function tokenScale() {
    if (tokenAnim <= 0) return 1;
    var p = 1 - tokenAnim / (tokenTricky ? TOKEN_TRICKY_T : TOKEN_IN_T); // 0..1
    var e = 1 - Math.pow(1 - Math.min(1, p * (tokenTricky ? 2 : 1)), 3);
    var s = 0.85 + 0.15 * e; // scale in 0.85 -> 1
    if (tokenTricky && p > 0.5) s += 0.06 * Math.sin((p - 0.5) * 2 * Math.PI);
    return s;
  }

  /* ---------- canvas sizing (DPR capped at 1.5) ---------- */
  var cssW = 0, cssH = 0;
  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cssW = rect.width; cssH = rect.height;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);

  /* ---------- button layout in canvas space (CSS px) ---------- */
  function layout() {
    var w = cssW, h = cssH;
    var pad = 14;
    var bw = (w - pad * 3) / 2;
    var bh = (h * 0.42 - pad * 2) / 2;
    var bottom = h - pad;
    return [
      { x: pad, y: bottom - bh, w: bw, h: bh },                 // 0 bottom-left
      { x: pad * 2 + bw, y: bottom - bh, w: bw, h: bh },        // 1 bottom-right
      { x: pad, y: bottom - bh * 2 - pad, w: bw, h: bh },       // 2 mid-left
      { x: pad * 2 + bw, y: bottom - bh * 2 - pad, w: bw, h: bh } // 3 mid-right
    ];
  }

  /* ---------- drawing ---------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSymbol(symbol, cx, cy, s) {
    ctx.beginPath();
    if (symbol === 'triangle') {
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s * 0.87, cy + s * 0.5);
      ctx.lineTo(cx - s * 0.87, cy + s * 0.5);
      ctx.closePath();
    } else if (symbol === 'diamond') {
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy);
      ctx.closePath();
    } else if (symbol === 'square') {
      ctx.rect(cx - s * 0.85, cy - s * 0.85, s * 1.7, s * 1.7);
    } else { // circle
      ctx.arc(cx, cy, s, 0, Math.PI * 2);
    }
  }

  function drawToken(s, cx, cy) {
    var c = COLORS[s.targetIndex];
    var word = COLORS[s.targetWord];
    var r = Math.min(cssW, cssH) * 0.155;
    var pulse = s.phase === 'playing' ? 1 + Math.sin((last || 0) / 180) * 0.02 : 1;
    var ts = tokenScale(); // fresh-target scale-in / confusable double-pulse

    // ring = per-target time left
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#2c2c48';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = c.hex;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (s.targetTimeLeft / Math.max(s.targetTimeTotal, 0.001)));
    ctx.stroke();

    // token body: dark disk so the INK is the cue (Stroop), never white-on-color
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse * ts, pulse * ts);
    ctx.fillStyle = '#15121b';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = c.hex;
    ctx.beginPath();
    ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
    ctx.stroke();

    // the matching-ink symbol, drawn in the TARGET color
    drawSymbolCue(s.targetIndex, 0, -r * 0.3, r * 0.3);

    // the conflicting Stroop word, rendered IN THE TARGET INK COLOR
    ctx.fillStyle = c.hex;
    ctx.font = '800 ' + Math.round(r * 0.32) + 'px "Avenir Next", "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(word.name, 0, r * 0.6);
    ctx.restore();
  }

  function drawButton(rect, color, idx, hot) {
    ctx.fillStyle = hot ? '#26263e' : '#1c1c2e';
    roundRect(rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fill();
    if (hot) {
      ctx.strokeStyle = '#bd9cff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    var s = Math.min(rect.w, rect.h) * 0.21;

    drawSymbolCue(idx, cx - rect.w * 0.18, cy, s);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 ' + Math.round(Math.min(rect.h * 0.3, 18)) + 'px "Avenir Next", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(idx + 1), rect.x + 10, rect.y + 12);
  }

  function render() {
    var s = game.getState();
    drawGrain(0, 0, cssW, cssH);

    var rects = layout();
    for (var i = 0; i < rects.length; i++) {
      var hot = s.phase === 'playing' && i === s.targetIndex && flash[i] > 0;
      drawButton(rects[i], COLORS[i], i, hot);
    }

    // idle / paused messaging
    ctx.textAlign = 'center';
    if (s.phase === 'idle') {
      ctx.fillStyle = '#9a9ab5';
      ctx.font = '700 15px "Avenir Next", sans-serif';
      ctx.fillText('Press START to play', cssW / 2, cssH * 0.28);
    } else if (s.phase === 'paused') {
      ctx.fillStyle = '#bd9cff';
      ctx.font = '800 20px "Avenir Next", sans-serif';
      ctx.fillText('PAUSED', cssW / 2, cssH * 0.26);
    }

    if (s.phase === 'playing' || s.phase === 'paused') {
      drawToken(s, cssW / 2, cssH * 0.27);
    }

    // ring shockwaves from hits
    for (var g = 0; g < rings.length; g++) {
      var rg = rings[g];
      if (rg.age < 0) continue; // staggered layer not started yet
      var rt = rg.age / rg.life;
      var re = 1 - Math.pow(1 - rt, 3); // ease-out expansion
      ctx.globalAlpha = (1 - rt) * rg.bright;
      ctx.lineWidth = rg.width;
      ctx.strokeStyle = rg.hex;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.start + rg.grow * re, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // particles
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      ctx.globalAlpha = Math.max(0, 1 - pt.age / pt.life);
      ctx.fillStyle = pt.hex;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    // red edge vignette fading after a wrong tap
    if (badFlash > 0) {
      var fa = badFlash / BAD_FLASH_T; // 1 -> 0
      ctx.strokeStyle = '#ff5d7d';
      ctx.globalAlpha = 0.85 * fa;
      ctx.lineWidth = 3;
      roundRect(3, 3, cssW - 6, cssH - 6, 15);
      ctx.stroke();
      ctx.globalAlpha = 0.3 * fa; // soft inner pass
      ctx.lineWidth = 16;
      roundRect(9, 9, cssW - 18, cssH - 18, 12);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- input ---------- */
  var flash = [0, 0, 0, 0];
  var lastKeyAt = {}; // key-repeat / multi-source double-press guard

  function doPress(slot, source) {
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var key = (source || 'slot') + ':' + slot;
    if (lastKeyAt[key] && now - lastKeyAt[key] < LOCKOUT * 1000) return; // repeat
    lastKeyAt[key] = now;
    var r = game.pressSlot(slot);
    if (r.ignored) return;
    var st = game.getState();
    flash[slot] = 0.15;
    if (r.hit) {
      sfx.good(st.combo);
      var rect = layout()[slot];
      var bx = rect.x + rect.w / 2, by = rect.y + rect.h / 2;
      burst(COLORS[slot].hex, bx, by, 14);
      ringBurst(COLORS[slot].hex, bx, by, st.combo);
      if (st.combo >= 3) {
        comboEl.textContent = (st.combo >= 8 ? 'ON FIRE' : st.combo >= 5 ? 'HOT' : 'NICE')
          + ' x' + st.combo + '  +' + r.points;
        comboEl.className = 'combo-pop ' + (st.combo >= 8 ? 'tier-8' : st.combo >= 5 ? 'tier-5' : 'tier-3');
        void comboEl.offsetWidth; // restart animation
        comboEl.classList.add('show');
      }
    } else if (st.lastOutcome && st.lastOutcome.reason === 'wrong') {
      sfx.bad();
      shake();
      if (!reduceMotion) badFlash = BAD_FLASH_T; // red edge vignette
    } else {
      sfx.expire();
    }
    if (st.phase === 'over') endRound(st);
    syncHud(st);
  }

  function shake() {
    if (reduceMotion) return;
    var wrap = canvas.parentElement;
    wrap.style.transition = 'transform 0.05s';
    var n = 0;
    var iv = setInterval(function () {
      n++;
      wrap.style.transform = 'translateX(' + ((n % 2 ? 4 : -4)) + 'px)';
      if (n >= 4) { clearInterval(iv); wrap.style.transform = ''; }
    }, 45);
  }

  // Canvas pointer mapping: client coords -> canvas CSS coords -> slot.
  // Buttons live in the lower half only, so stray taps near the top
  // (where controls/overlay may sit on small screens) never register.
  function slotFromClient(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return -1;
    var rects = layout();
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  function onPointer(e) {
    if (game.getState().phase !== 'playing') return;
    var slot = slotFromClient(e.clientX, e.clientY);
    if (slot >= 0) {
      e.preventDefault();
      doPress(slot);
    }
  }
  canvas.addEventListener('pointerdown', onPointer);

  /* keyboard: 1-4 answer, P pause, M mute, Enter start/replay */
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    var st = game.getState();
    if (k >= '1' && k <= '4') {
      if (!e.repeat) doPress(k.charCodeAt(0) - 49, 'key'); // block key-repeat
      e.preventDefault();
    } else if (k === 'p' || k === 'P') {
      togglePause();
    } else if (k === 'm' || k === 'M') {
      toggleMute();
    } else if (k === 'Enter') {
      if (st.phase === 'idle' || st.phase === 'over') startGame();
    }
  });

  /* ---------- HUD / flow ---------- */
  function syncHud(s) {
    scoreEl.textContent = String(s.score);
    bestEl.textContent = String(best);
    roundEl.textContent = String(Math.ceil(Math.max(0, s.roundTimeLeft)));
    roundEl.setAttribute('aria-label', Math.ceil(Math.max(0, s.roundTimeLeft)) + ' seconds left in round');
    var roundCell = document.getElementById('roundCell');
    if (roundCell) roundCell.classList.toggle('low', s.roundTimeLeft <= 10);
    var hearts = '';
    for (var i = 0; i < s.maxHearts; i++) {
      hearts += i < s.hearts ? '\u2665' : '<span class="lost">\u2665</span>';
    }
    heartsEl.innerHTML = hearts;
    heartsEl.setAttribute('aria-label', s.hearts + ' hearts left');
    if (prevHearts >= 0 && s.hearts < prevHearts) pulseHearts();
    prevHearts = s.hearts;
  }

  var prevHearts = -1; // spots heart losses from wrong taps AND expiries
  var heartsPulseTimer = 0;
  function pulseHearts() {
    if (reduceMotion) return;
    heartsEl.classList.remove('hurt');
    void heartsEl.offsetWidth; // restart animation
    heartsEl.classList.add('hurt');
    if (heartsPulseTimer) clearTimeout(heartsPulseTimer);
    heartsPulseTimer = setTimeout(function () {
      heartsEl.classList.remove('hurt');
    }, 500);
  }

  function showOverlay(show, s) {
    overlay.hidden = !show;
    startBtn.hidden = !show && game.getState().phase !== 'idle';
    if (show && s) {
      overTitle.textContent = s.hearts <= 0 ? 'OUT OF HEARTS' : 'TIME\u2019S UP';
      finalScore.textContent = String(s.score);
      finalCombo.textContent = 'x' + s.bestCombo;
      finalBest.textContent = String(best);
      var isNewBest = s.score > 0 && s.score >= best && s.score > Number(overlay.dataset.prevBest || 0);
      newBest.hidden = !isNewBest;
      newBest.classList.toggle('is-new-best', isNewBest);
    }
  }

  function endRound(s) {
    s = s || game.getState();
    if (ended) return; // recap exactly once per round
    ended = true;
    var isRecord = s.score > best;
    if (isRecord) saveBest(s.score);
    overlay.dataset.prevBest = String(best - (isRecord ? s.score : 0));
    showOverlay(true, s);
    startBtn.hidden = true;
    resumeBtn.hidden = true;
    shareBtn.hidden = false;
    sfx.over();
    syncHud(s);
  }

  var ended = false; // guards against double recap from timer + press paths

  function startGame() {
    ended = false;
    particles.length = 0;
    rings.length = 0;
    badFlash = 0;
    tokenAnim = 0;
    lastTargetIndex = -1; // so the first token plays its scale-in
    flash = [0, 0, 0, 0];
    lastKeyAt = {};
    overlay.hidden = true;
    startBtn.hidden = true;
    resumeBtn.hidden = true;
    shareBtn.hidden = true;
    shareStatus.textContent = '';
    pauseBtn.setAttribute('aria-pressed', 'false');
    game.start();
    sfx.start();
    syncHud(game.getState());
  }

  function togglePause() {
    var st = game.getState();
    if (st.phase === 'playing') {
      game.pause();
      pauseBtn.setAttribute('aria-pressed', 'true');
      resumeBtn.hidden = false;
    } else if (st.phase === 'paused') {
      game.resume();
      pauseBtn.setAttribute('aria-pressed', 'false');
      resumeBtn.hidden = true;
    }
  }

  function toggleMute() {
    muted = !muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
  }

  startBtn.addEventListener('click', startGame);
  replayBtn.addEventListener('click', startGame);
  resumeBtn.addEventListener('click', togglePause);
  pauseBtn.addEventListener('click', togglePause);
  muteBtn.addEventListener('click', toggleMute);

  /* pause on tab hide */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.getState().phase === 'playing') {
      game.pause();
      pauseBtn.setAttribute('aria-pressed', 'true');
      resumeBtn.hidden = false;
    }
  });

  /* ---------- share ---------- */
  function shareText() {
    return 'I scored ' + game.getState().score + ' in Color Panic! Can you beat it?';
  }
  function doShare() {
    var text = shareText();
    if (navigator.share) {
      navigator.share({ title: 'Color Panic', text: text }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        shareStatus.textContent = 'Score copied to clipboard!';
      }, function () {
        shareStatus.textContent = text;
      });
    } else {
      shareStatus.textContent = text;
    }
  }
  shareBtn.addEventListener('click', doShare);
  shareBtn2.addEventListener('click', doShare);

  /* ---------- main loop ---------- */
  var last = 0;
  function frame(now) {
    var dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
    last = now;
    game.update(dt);
    for (var i = 0; i < 4; i++) if (flash[i] > 0) flash[i] -= dt;
    if (badFlash > 0) badFlash -= dt;
    if (tokenAnim > 0) tokenAnim -= dt;
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.age += dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 300 * dt;
      if (pt.age >= pt.life) particles.splice(p, 1);
    }
    for (var g = rings.length - 1; g >= 0; g--) {
      rings[g].age += dt;
      if (rings[g].age >= rings[g].life) rings.splice(g, 1);
    }
    var st = game.getState();
    // fresh target -> token scale-in; confusable ones get the tricky tell
    if (st.targetIndex !== lastTargetIndex) {
      lastTargetIndex = st.targetIndex;
      tokenTricky = !!st.targetConfusable;
      if (!reduceMotion) tokenAnim = tokenTricky ? TOKEN_TRICKY_T : TOKEN_IN_T;
    }
    render();
    if (st.phase === 'playing') syncHud(st); // live timers/score
    // Core can end the round itself (round timer / heart expiry on
    // expiry-driven frames) — the frame loop owns the recap transition.
    if (st.phase === 'over' && !ended) endRound(st);
    requestAnimationFrame(frame);
  }

  /* ---------- QA hook (only with ?qa=1) ---------- */
  if (qaMode) {
    window.__gameTest = {
      getState: function () { return game.getState(); },
      getBest: function () { return best; },
      press: function (slot) { doPress(slot); },
      keyPress: function (k) {
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k }));
      },
      start: function () { startGame(); },
      togglePause: function () { togglePause(); },
      shareText: shareText,
      canvasSlotAt: function (clientX, clientY) { return slotFromClient(clientX, clientY); },
      buttons: {
        start: startBtn, pause: pauseBtn, resume: resumeBtn,
        mute: muteBtn, replay: replayBtn, share: shareBtn
      }
    };
  }

  /* ---------- boot ---------- */
  resize();
  syncHud(game.getState());
  startBtn.hidden = false;
  requestAnimationFrame(frame);
})();
