/* ============================================================
 * Stack Rush — browser front-end. Depends only on PocketGame
 * (core.js, loaded first). No frameworks, no runtime deps.
 * ============================================================ */
(function () {
  'use strict';

  var PG = window.PocketGame;
  if (!PG) return;

  var QA = /[?&]qa=1/.test(window.location.search);

  // ---- guarded localStorage --------------------------------
  var store = (function () {
    try {
      var k = '__sr_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (e) {
      var mem = {};
      return {
        getItem: function (k) { return mem[k] || null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
    }
  })();
  var BEST_KEY = 'stack-rush-best';

  // ---- DOM -------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  var hud = $('hud');
  var scoreEl = $('score');
  var comboEl = $('combo');
  var screenStart = $('screen-start');
  var screenPause = $('screen-pause');
  var screenOver = $('screen-over');
  var bestStartEl = $('best-start');
  var finalScoreEl = $('final-score');
  var recapScoreEl = $('recap-score-val');
  var recapPerfectEl = $('recap-perfect');
  var recapStreakEl = $('recap-streak');
  var recapBestEl = $('recap-best');
  var newBestEl = $('new-best');
  var shareStatusEl = $('share-status');
  var btnSound = $('btn-sound');
  var btnPause = $('btn-pause');

  // ---- game ------------------------------------------------
  var rng = PG.mulberry32((Date.now() & 0xffffffff) >>> 0);
  var game = PG.createGame({ rng: rng });
  var LOGICAL_W = PG.constants.W;
  var LOGICAL_H = PG.constants.H;
  var DPR_CAP = 1.5;
  var scale = 1; // canvas px per logical px

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = canvas.width / LOGICAL_W;
  }
  window.addEventListener('resize', resize);

  // pointer -> logical coords
  function toLogical(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (LOGICAL_W / rect.width),
      y: (e.clientY - rect.top) * (LOGICAL_H / rect.height)
    };
  }

  // ---- audio (procedural, no assets) -----------------------
  var AudioSys = (function () {
    var actx = null, muted = false;
    function ensure() {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function blip(freq, dur, type, gainVal, slideTo) {
      if (muted) return;
      var a = ensure();
      if (!a) return;
      var osc = a.createOscillator();
      var g = a.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, a.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
      g.gain.setValueAtTime(gainVal || 0.08, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      osc.connect(g); g.connect(a.destination);
      osc.start(); osc.stop(a.currentTime + dur);
    }
    return {
      drop: function () { blip(180, 0.12, 'square', 0.09); },
      perfect: function (streak) { blip(520 + streak * 60, 0.14, 'triangle', 0.1, 900 + streak * 80); },
      miss: function () { blip(220, 0.5, 'sawtooth', 0.1, 60); },
      ui: function () { blip(440, 0.06, 'sine', 0.05); },
      setMuted: function (m) { muted = m; },
      isMuted: function () { return muted; },
      unlock: ensure
    };
  })();

  // ---- particles -------------------------------------------
  var particles = [];
  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- art assets (cached Images; primitives until loaded) ----
  // Textures are opaque tiles: ink-grain (#10101b stipple) for the
  // background, block-grain (warm-yellow stipple) clipped inside blocks
  // on top of the hue fill. No gradients / glow / blur for scenery.
  var art = {
    ink: null,
    block: null,
    ready: false
  };
  (function loadArt() {
    var pending = 2;
    function done() { if (--pending === 0) art.ready = true; }
    var ink = new Image();
    ink.onload = function () { art.ink = ink; done(); };
    ink.onerror = done;
    ink.src = '../../assets/ink-grain.png';
    var block = new Image();
    block.onload = function () { art.block = block; done(); };
    block.onerror = done;
    block.src = '../../assets/block-grain.png';
  })();

  // Pattern for the ink background, created lazily once loaded.
  var inkPattern = null;
  function drawBackground(s) {
    if (art.ink && !inkPattern) {
      try { inkPattern = ctx.createPattern(art.ink, 'repeat'); } catch (e) { inkPattern = null; }
    }
    if (inkPattern) {
      // keep the stipple fixed to the world so it pans subtly with the camera
      ctx.save();
      ctx.translate(0, sx((s.cameraY * 0.15) % 64));
      ctx.fillStyle = inkPattern;
      ctx.fillRect(0, -sx(64), canvas.width, canvas.height + sx(128));
      ctx.restore();
    } else {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // parallax star dots (static seed positions, cheap)
      ctx.fillStyle = '#22223a';
      for (var i = 0; i < 24; i++) {
        var px = ((i * 97) % LOGICAL_W) * scale;
        var py = (((i * 53 + ((s.cameraY * 0.15) % LOGICAL_H)) % LOGICAL_H) + LOGICAL_H) % LOGICAL_H * scale;
        ctx.fillRect(px, py, scale * 2, scale * 2);
      }
    }
  }

  function burst(x, y, hue, n) {
    if (reducedMotion) n = Math.min(n || 12, 3);
    for (var i = 0; i < (n || 12); i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 260,
        vy: -Math.random() * 260 - 40,
        life: 0.5 + Math.random() * 0.3,
        t: 0,
        hue: hue,
        size: 3 + Math.random() * 4
      });
    }
  }
  function stepParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt;
    }
  }

  // ---- rendering -------------------------------------------
  function sx(x) { return x * scale; }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // block-grain texture pattern, tiled at logical scale and clipped to the
  // block rect. Cropped from the opaque warm-yellow stipple tile so the hue
  // stays readable: pattern drawn with 'overlay' over the flat fill.
  var blockPattern = null;
  function drawBlock(b, hue, perfect, alpha) {
    var x = sx(b.x), y = sx(b.y), w = sx(b.w), h = sx(b.h);
    var base = w < sx(20) ? 3 : 6;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = 'hsl(' + hue + ', 85%, 60%)';
    roundRect(x, y, w, h, base);
    ctx.fill();
    if (art.block && w > sx(8) && h > sx(8)) {
      if (!blockPattern) {
        try { blockPattern = ctx.createPattern(art.block, 'repeat'); } catch (e) { blockPattern = null; }
      }
      if (blockPattern) {
        ctx.save();
        roundRect(x, y, w, h, base);
        ctx.clip();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.55;
        ctx.fillStyle = blockPattern;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        ctx.globalAlpha = alpha == null ? 1 : alpha;
      }
    }
    // top face highlight — opaque, geometric
    ctx.fillStyle = 'hsl(' + hue + ', 95%, 74%)';
    roundRect(x, y, w, h * 0.32, base);
    ctx.fill();
    // neon edge
    ctx.strokeStyle = 'hsl(' + hue + ', 100%, 82%)';
    ctx.lineWidth = Math.max(1.5, sx(1.5));
    ctx.stroke();
    if (perfect) {
      ctx.fillStyle = '#ffe66d';
      roundRect(x + sx(2), y + sx(2), w - sx(4), sx(3), 1.5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    var s = game.getState();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground(s);

    // world transform: world y up -> screen y down, plus camera pan
    function worldToScreenY(worldYBottom, h) {
      // logical screen coords (0..H), then scaled by canvas transform
      return LOGICAL_H - (worldYBottom + h) + s.cameraY;
    }

    // settled layers
    for (var li = 0; li < s.layers.length; li++) {
      var l = s.layers[li];
      var sy0 = worldToScreenY(l.y, l.h);
      if (sy0 > LOGICAL_H + 40 || sy0 + l.h < -40) continue;
      drawBlock({ x: l.x, y: sy0, w: l.w, h: l.h }, l.hue, l.perfect);
    }

    // moving block
    if (s.moving) {
      var m = s.moving;
      var my = worldToScreenY(m.y, m.h);
      // guide line showing alignment
      if (s.layers.length && !reducedMotion) {
        var prev = s.layers[s.layers.length - 1];
        ctx.strokeStyle = 'rgba(255, 230, 109, 0.25)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(sx(prev.x), sx(my + m.h));
        ctx.lineTo(sx(prev.x), sx(my));
        ctx.moveTo(sx(prev.x + prev.w), sx(my + m.h));
        ctx.lineTo(sx(prev.x + prev.w), sx(my));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawBlock({ x: m.x, y: my, w: m.w, h: m.h }, m.hue, false);

      // drop shadow projection onto the tower top
      if (s.layers.length) {
        var p2 = s.layers[s.layers.length - 1];
        var lo = Math.max(m.x, p2.x);
        var hi = Math.min(m.x + m.w, p2.x + p2.w);
        if (hi > lo) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(sx(lo), sx(my + m.h), sx(hi - lo), sx(4));
        }
      }
    }

    // debris
    for (var di = 0; di < s.debris.length; di++) {
      var d = s.debris[di];
      drawBlock({ x: d.x, y: worldToScreenY(d.y, d.h), w: d.w, h: d.h }, d.hue, false, Math.max(0, Math.min(1, d.life / 0.6)));
    }

    // particles (drawn in logical screen space)
    for (var pi = 0; pi < particles.length; pi++) {
      var p = particles[pi];
      var a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'hsl(' + p.hue + ', 90%, 65%)';
      ctx.fillRect(sx(p.x) - p.size / 2, sx(p.y) - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }

  // ---- HUD / screens ---------------------------------------
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function refreshHud() {
    var s = game.getState();
    scoreEl.textContent = String(s.score);
    if (s.streak >= 2) {
      comboEl.textContent = 'PERFECT x' + s.streak;
      show(comboEl);
    } else {
      hide(comboEl);
    }
  }

  function getBest() {
    var v = parseInt(store.getItem(BEST_KEY), 10);
    return isNaN(v) ? 0 : v;
  }
  function setBest(v) {
    try { store.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
  }

  function showOver() {
    var s = game.getState();
    var best = getBest();
    var isBest = s.score > best;
    if (isBest) { best = s.score; setBest(best); }
    finalScoreEl.textContent = String(s.score);
    recapScoreEl.textContent = String(s.score);
    recapPerfectEl.textContent = String(s.perfectCount);
    recapStreakEl.textContent = String(s.bestStreak);
    recapBestEl.textContent = String(best);
    bestStartEl.textContent = String(best);
    if (isBest && s.score > 0) show(newBestEl); else hide(newBestEl);
    hide(shareStatusEl);
    show(screenOver);
  }

  // ---- actions ---------------------------------------------
  function startGame() {
    hide(screenStart); hide(screenOver); hide(screenPause);
    show(hud);
    game.start();
    refreshHud();
    AudioSys.unlock();
    AudioSys.ui();
  }

  function pauseGame() {
    if (game.getState().phase !== 'playing') return;
    game.pause();
    show(screenPause);
    btnPause.textContent = '▶';
    AudioSys.ui();
  }
  function resumeGame() {
    if (game.getState().phase !== 'paused') return;
    game.resume();
    hide(screenPause);
    btnPause.textContent = '⏸';
    AudioSys.ui();
  }

  function doDrop() {
    var s = game.getState();
    if (s.phase !== 'playing') return;
    var layersBefore = s.layers.length;
    var scoreBefore = s.score;
    game.input('drop');
    var s2 = game.getState();
    var ev = s2.lastEvent;
    if (!ev) return;
    if (ev.type === 'perfect') {
      AudioSys.perfect(ev.streak);
      var t = s2.layers[s2.layers.length - 1];
      burst(t.x + t.w / 2, LOGICAL_H - (t.y + t.h / 2) + s2.cameraY, t.hue, 18);
    } else if (ev.type === 'drop') {
      AudioSys.drop();
      if (s2.layers.length > layersBefore) {
        var t2 = s2.layers[s2.layers.length - 1];
        burst(t2.x + t2.w / 2, LOGICAL_H - (t2.y + t2.h / 2) + s2.cameraY, t2.hue, 8);
      }
    } else if (ev.type === 'miss') {
      AudioSys.miss();
      setTimeout(function () { if (game.getState().phase === 'over') showOver(); }, 650);
    }
    refreshHud();
  }

  function replay() {
    particles.length = 0;
    startGame();
  }

  function toggleSound() {
    AudioSys.setMuted(!AudioSys.isMuted());
    btnSound.classList.toggle('muted', AudioSys.isMuted());
    btnSound.textContent = AudioSys.isMuted() ? '✕' : '♪';
    if (!AudioSys.isMuted()) AudioSys.ui();
  }

  function shareScore() {
    var s = game.getState();
    var text = 'I scored ' + s.score + ' points (' + s.layers.length + ' layers) in Stack Rush! Can you beat it? ' + location.href.split('?')[0];
    show(shareStatusEl);
    shareStatusEl.textContent = '';
    if (navigator.share) {
      navigator.share({ title: 'Stack Rush', text: text }).then(function () {
        shareStatusEl.textContent = 'Shared!';
      }).catch(function () {
        shareStatusEl.textContent = 'Share cancelled.';
      });
      return;
    }
    // fallback: clipboard, then prompt as last resort
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        shareStatusEl.textContent = 'Copied to clipboard!';
      }).catch(function () {
        shareStatusEl.textContent = text;
      });
    } else {
      shareStatusEl.textContent = text;
    }
  }

  // ---- input wiring ----------------------------------------
  // Guard: gestures on control buttons must not drop blocks.
  function onStagePointer(e) {
    if (e.target.closest('button, a')) return;
    var s = game.getState();
    if (s.phase === 'ready') { startGame(); return; }
    if (s.phase === 'paused') return; // must use resume button
    if (s.phase === 'over') return;   // must use replay button
    if (s.phase === 'playing') {
      AudioSys.unlock();
      doDrop();
    }
  }
  canvas.addEventListener('pointerdown', onStagePointer);

  // Guard: a control keeps focus after tap/click, which would make the next
  // Space press re-activate the button (native click) instead of dropping.
  // Blur after handling so keyboard control returns to the document.
  function bindBtn(id, fn) {
    $(id).addEventListener('click', function (e) {
      e.stopPropagation();
      fn(e);
      if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
    });
  }
  bindBtn('btn-start', function () { startGame(); });
  bindBtn('btn-replay', function () { replay(); });
  bindBtn('btn-resume', function () { resumeGame(); });
  bindBtn('btn-pause', function () { (game.getState().phase === 'paused') ? resumeGame() : pauseGame(); });
  bindBtn('btn-sound', function () { toggleSound(); });
  bindBtn('btn-share', function () { shareScore(); });
  bindBtn('btn-quit', function () {
    game.reset();
    hide(screenPause); hide(hud);
    show(screenStart);
    bestStartEl.textContent = String(getBest());
  });

  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.target.closest && e.target.closest('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
    var s = game.getState();
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (s.phase === 'ready') startGame();
      else if (s.phase === 'playing') doDrop();
      else if (s.phase === 'over' && !screenOver.querySelector(':focus')) {
        // Enter/Space on focused replay button handled natively; else ignore to avoid accidental restart
      }
    } else if (e.key === 'p' || e.key === 'P') {
      if (s.phase === 'playing') pauseGame();
      else if (s.phase === 'paused') resumeGame();
    } else if (e.key === 'm' || e.key === 'M') {
      toggleSound();
    } else if (e.key === 'r' || e.key === 'R') {
      if (s.phase === 'playing' || s.phase === 'over') replay();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.getState().phase === 'playing') pauseGame();
  });

  // ---- QA hook (only when ?qa=1) ----------------------------
  if (QA) {
    window.__gameTest = {
      getState: function () { return game.getState(); },
      drop: function () { doDrop(); },
      start: function () { startGame(); },
      pause: function () { pauseGame(); },
      resume: function () { resumeGame(); },
      setInput: function (a) { return game.input(a); },
      toLogical: toLogical,
      best: getBest
    };
  }

  // ---- boot -------------------------------------------------
  resize();
  bestStartEl.textContent = String(getBest());
  var last = performance.now();
  var rafId = 0;
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    game.update(dt);
    stepParticles(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
})();
