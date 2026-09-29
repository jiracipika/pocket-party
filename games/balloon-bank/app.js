/* Pocket Party: Balloon Bank — browser app.
 * Renders the deterministic core (core.js): hold anywhere to pump, release
 * to bank. Hold-Space on desktop. All rules live in the core. */
(function () {
  'use strict';

  var PG = window.PocketGame;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var CANVAS_W = 360, CANVAS_H = 640;
  var GROUND_Y = 560;
  var BALLOON_X = 180, BALLOON_ANCHOR_Y = 470; // knot sits near the pump pad
  var ACCENT = '#7ddcff';
  var ACCENT_LIGHT = '#c2ecff';
  var DANGER = '#ff6b6b';
  // S4 special balloon palettes (normal sky / golden / quick-leak pink / heart green)
  var TYPE_COLORS = {
    normal: { light: '#c2ecff', base: '#7ddcff', dark: '#3a8fb8' },
    golden: { light: '#fff3c4', base: '#ffd23f', dark: '#b8860b' },
    quick:  { light: '#ffd3de', base: '#ff8fa3', dark: '#b85c6e' },
    heart:  { light: '#d0ffdf', base: '#7dffb2', dark: '#3aa874' }
  };

  var el = {
    score: document.getElementById('hudScore'),
    best: document.getElementById('hudBest'),
    time: document.getElementById('hudTime'),
    hearts: document.getElementById('hudHeartsVal'),
    chain: document.getElementById('hudChain'),
    startBestLine: document.getElementById('startBestLine'),
    startBest: document.getElementById('startBest'),
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
    recapBanks: document.getElementById('recapBanks'),
    recapBig: document.getElementById('recapBig'),
    recapPops: document.getElementById('recapPops'),
    recapChain: document.getElementById('recapChain'),
    recapBest: document.getElementById('recapBest'),
    srStatus: document.getElementById('srStatus')
  };

  // ---------- storage (guarded) ----------
  var bestKey = 'balloon-bank-best';
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
    try { return window.localStorage.getItem('balloon-bank-muted') === '1'; } catch (e) { return false; }
  }
  function saveMuted(m) {
    try { window.localStorage.setItem('balloon-bank-muted', m ? '1' : '0'); } catch (e) { /* noop */ }
  }

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
    pump: function (r, rMax) { // tick rises with size
      var f = 220 + 480 * Math.min(1, r / rMax);
      blip(f, 0.05, 'square', 0.06);
    },
    creak: function () { blip(140, 0.09, 'sawtooth', 0.05); blip(120, 0.09, 'sawtooth', 0.04, 0.1); },
    bank: function (mult) {
      blip(660, 0.08, 'sine', 0.11);
      blip(880, 0.09, 'sine', 0.1, 0.06);
      if (mult >= 2) blip(1320, 0.12, 'sine', 0.09, 0.12);
    },
    pop: function () { blip(90, 0.18, 'square', 0.14); blip(50, 0.25, 'sawtooth', 0.12, 0.02); },
    over: function () { blip(392, 0.12, 'triangle', 0.1); blip(294, 0.14, 'triangle', 0.1, 0.1); blip(196, 0.22, 'triangle', 0.1, 0.2); },
    start: function () { blip(440, 0.08, 'triangle', 0.09); blip(660, 0.1, 'triangle', 0.09, 0.06); }
  };

  // ---------- game state ----------
  var game = PG.createGame({ rng: PG.mulberry32((Math.random() * 0xffffffff) >>> 0) });
  game.best = loadBest();
  el.startBest.textContent = String(game.best);
  if (game.best > 0) el.startBestLine.classList.remove('hidden');

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var particles = [];   // {x, y, vx, vy, t, life, size, color}
  var popups = [];      // {x, y, text, t, life, big}
  var raf = null, lastTs = 0;
  var running = false;
  var shakeT = 0;
  var creakPlayed = false;
  var pumpAccum = 0;    // spacing for pump ticks

  // ---------- canvas sizing ----------
  var stage = document.getElementById('stage');
  function resize() {
    var rect = stage.getBoundingClientRect();
    var dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(rect.width));
    // fit the viewport height on short/landscape screens (sibling behavior):
    // the 360x640 logical space stretches, the element never overflows
    var h = Math.max(320, Math.min(Math.round(w * CANVAS_H / CANVAS_W), window.innerHeight - rect.top - 18));
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(cv.width / CANVAS_W, 0, 0, cv.height / CANVAS_H, 0, 0);
  }
  window.addEventListener('resize', resize);

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
    el.hearts.textContent = fmtHearts(game.hearts);
    // the badge previews what the NEXT bank will pay (x2 from chain 2 onward)
    var nextMult = PG.chainMultFor(game.chain + 1);
    el.chain.hidden = nextMult < 2;
    el.chain.textContent = 'x' + nextMult;
  }

  // ---------- fx helpers ----------
  function burst(x, y, color, n, life) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 160;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        t: 0, life: (life || 500) / 1000,
        size: 2 + Math.random() * 4, color: color
      });
    }
  }
  function popup(x, y, text, big) {
    popups.push({ x: x, y: y, text: text, t: 0, life: 0.9, big: !!big });
  }

  // ---------- render ----------
  function wobbleT() { return performance.now() / 1000; }

  function drawBalloon() {
    if (game.radius <= 0) return; // respawning
    var r = game.radius;
    var amp = game.creaking ? 3.4 : 1.2;
    if (reduceMotion) amp = 0;
    var t = wobbleT();
    var wobble = Math.sin(t * (game.creaking ? 26 : 9)) * amp;
    var cx = BALLOON_X + wobble;
    var cy = BALLOON_ANCHOR_Y - r;   // balloon grows upward from the pad
    var nearPop = game.creaking;
    var pal = TYPE_COLORS[game.type] || TYPE_COLORS.normal;
    var grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r);
    grad.addColorStop(0, pal.light);
    grad.addColorStop(0.6, nearPop ? mix(pal.base, DANGER, 0.35 + 0.25 * Math.sin(t * 18)) : pal.base);
    grad.addColorStop(1, nearPop ? '#a04a4a' : pal.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.92, r, wobble * 0.01, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth = 3;
    ctx.stroke();
    // knot + string
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r);
    ctx.lineTo(cx - 5, cy + r + 8);
    ctx.lineTo(cx + 5, cy + r + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r + 8);
    ctx.quadraticCurveTo(cx + 6, cy + r + 26, cx, cy + r + 42);
    ctx.stroke();
    // size meter: thin arc approaching the hidden limit (only when creaking)
    if (nearPop) {
      ctx.strokeStyle = DANGER;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();
    }
  }

  function mix(a, b, f) { // hex mix, f in 0..1 — cheap inline for two accents
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - f) + ((pb >> 16) & 255) * f);
    var g = Math.round(((pa >> 8) & 255) * (1 - f) + ((pb >> 8) & 255) * f);
    var bl = Math.round((pa & 255) * (1 - f) + (pb & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function drawPad() {
    // pump pad under the balloon
    ctx.fillStyle = '#1e2a3d';
    ctx.fillRect(BALLOON_X - 60, GROUND_Y - 14, 120, 14);
    ctx.fillStyle = '#283952';
    ctx.fillRect(BALLOON_X - 60, GROUND_Y - 14, 120, 4);
    ctx.fillStyle = 'rgba(125,220,255,0.25)';
    ctx.fillRect(BALLOON_X - 8, GROUND_Y - 30, 16, 16);
    // ground
    ctx.fillStyle = '#141d2e';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
    ctx.fillStyle = 'rgba(125,220,255,0.18)';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 3);
  }

  function drawBackdrop() {
    var bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    bg.addColorStop(0, '#0d1626');
    bg.addColorStop(1, '#101c30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // far balloons, decorative
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = ACCENT;
    ctx.beginPath(); ctx.arc(52, 130, 26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(310, 200, 34, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(292, 84, 18, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw() {
    var shakeX = 0, shakeY = 0;
    if (shakeT > 0 && !reduceMotion) {
      shakeX = (Math.random() - 0.5) * 10 * shakeT / 0.2;
      shakeY = (Math.random() - 0.5) * 10 * shakeT / 0.2;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackdrop();
    drawPad();
    drawBalloon();
    for (var p = 0; p < particles.length; p++) {
      var pt = particles[p];
      ctx.globalAlpha = 1 - pt.t / pt.life;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    for (var q = 0; q < popups.length; q++) {
      var pu = popups[q];
      var fade = 1 - pu.t / pu.life;
      ctx.globalAlpha = fade;
      ctx.fillStyle = pu.big ? ACCENT_LIGHT : '#ffffff';
      ctx.font = (pu.big ? '800 26px' : '700 18px') + ' "Avenir Next", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pu.text, pu.x, pu.y - pu.t * 46);
    }
    ctx.globalAlpha = 1;
    if (game.state === 'ready') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '700 15px "Avenir Next", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Hold anywhere to pump', CANVAS_W / 2, CANVAS_H * 0.24);
    }
    ctx.restore();
  }

  // ---------- main loop ----------
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(50, ts - (lastTs || ts));
    lastTs = ts;
    if (running && game.state === 'playing') {
      game.update(dt);
      // pump ticks: spaced, rising with size
      if (game.held && game.radius > 0) {
        pumpAccum += dt;
        if (pumpAccum > 110) { pumpAccum = 0; sfx.pump(game.radius, game.CONST.R_MAX); }
      } else pumpAccum = 110;
      if (game.creaking && !creakPlayed) { sfx.creak(); creakPlayed = true; }
      if (!game.creaking) creakPlayed = false;
      playEvents(game.takeEvents());
    }
    // fx integration
    var dtS = dt / 1000;
    for (var i = particles.length - 1; i >= 0; i--) {
      var pt = particles[i];
      pt.t += dtS;
      pt.x += pt.vx * dtS; pt.y += pt.vy * dtS;
      pt.vy += 380 * dtS;
      if (pt.t >= pt.life) particles.splice(i, 1);
    }
    for (var j = popups.length - 1; j >= 0; j--) {
      popups[j].t += dtS;
      if (popups[j].t >= popups[j].life) popups.splice(j, 1);
    }
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dtS);
    syncHud();
    draw();
  }
  function ensureLoop() {
    if (raf === null) { raf = requestAnimationFrame(frame); }
  }

  // ---------- events from core ----------
  function playEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e[0] === 'bank') {
        sfx.bank(e[2]);
        var label = '+' + e[1] + (e[2] > 1 ? ' (x' + e[2] + ')' : '');
        if (e[3] === 'golden') label += ' GOLD';
        else if (e[3] === 'heart') label += ' +\u2665';
        popup(BALLOON_X, BALLOON_ANCHOR_Y - game.CONST.R_MIN - 120, label, e[2] > 1 || e[3] === 'golden');
        burst(BALLOON_X, BALLOON_ANCHOR_Y - 60, (TYPE_COLORS[e[3]] || TYPE_COLORS.normal).base, 10);
        announce('Banked ' + e[1] + ' points.');
      } else if (e[0] === 'heart') {
        burst(BALLOON_X, BALLOON_ANCHOR_Y - 90, TYPE_COLORS.heart.base, 14, 600);
        announce('Heart restored!');
      } else if (e[0] === 'pop') {
        sfx.pop();
        var popY = BALLOON_ANCHOR_Y - 70; // core zeroes radius before the event lands
        burst(BALLOON_X, popY, DANGER, 18, 650);
        burst(BALLOON_X, popY, '#ffffff', 6, 400);
        if (!reduceMotion) shakeT = 0.2;
        announce('Popped! Lost a heart.');
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
    el.finalScore.textContent = String(game.score);
    el.recapBanks.textContent = String(game.banks);
    el.recapBig.textContent = String(game.biggestBank);
    el.recapPops.textContent = String(game.pops);
    el.recapChain.textContent = 'x' + Math.max(1, PG.chainMultFor(game.bestChain));
    el.recapBest.textContent = newBest && game.score > 0 ? 'Yes!' : 'No';
    el.recapBest.classList.toggle('is-new-best', newBest && game.score > 0);
    show(el.ovOver, true);
    setPauseEnabled(false);
    announce('Round over. Score ' + game.score + '.');
  }

  function startRound() {
    try { var a = ac(); if (a && a.state === 'suspended') a.resume().catch(function () {}); } catch (e) {}
    game.start();
    particles.length = 0;
    popups.length = 0;
    creakPlayed = false;
    shakeT = 0;
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

  // ---------- input: hold anywhere on the canvas (pointer) + Space ----------
  function setHold(on) {
    if (game.state !== 'playing') { game.setHold(false); return; }
    game.setHold(on);
    if (on) { running = true; ensureLoop(); }
  }
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); setHold(true); });
  window.addEventListener('pointerup', function () { setHold(false); });
  window.addEventListener('pointercancel', function () { setHold(false); });
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.code === 'Space') { setHold(true); e.preventDefault(); }
    else if (e.code === 'KeyP') { if (game.state === 'playing') doPause(); else if (game.state === 'paused') doResume(); }
    else if (e.code === 'KeyM') { toggleMute(); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') setHold(false);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.state === 'playing') doPause();
  });

  // ---------- buttons ----------
  el.btnStart.addEventListener('click', function () { startRound(); });
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
    return 'I scored ' + game.score + ' in Balloon Bank (Pocket Party). Can you bank bigger?';
  }
  el.btnShare.addEventListener('click', function () {
    var text = shareText();
    var url = window.location.href.split('?')[0];
    if (navigator.share) {
      navigator.share({ title: 'Balloon Bank', text: text, url: url }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + ' ' + url).then(function () {
        announce('Copied to clipboard.');
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
          hearts: game.hearts, radius: Math.round(game.radius * 10) / 10,
          threshold: Math.round(game.threshold * 1000) / 1000,
          chain: game.chain, bestChain: game.bestChain,
          timeLeft: game.timeLeft, banks: game.banks, pops: game.pops,
          held: game.held, creaking: game.creaking, respawnMs: game.respawnMs,
          type: game.type
        };
      },
      start: startRound,
      hold: setHold,
      bank: function () { game.bank(); },
      pause: doPause,
      resume: doResume,
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
