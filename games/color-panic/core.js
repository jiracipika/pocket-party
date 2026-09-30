/**
 * Color Panic — pure game core (ES5-compatible UMD).
 *
 * Pure logic: no DOM, no clock, no ambient randomness. Time flows in
 * through update(dtSeconds); randomness is injected via opts.random.
 *
 * Browser:  <script src="core.js"></script>  ->  PocketGame.createGame
 * Node:     require('./core.js')             ->  .createGame
 *
 * Stroop rules: the central token shows a COLOR (its ink fill + a shape
 * symbol). The word printed inside it is deliberately wrong sometimes —
 * players must match the ink color + symbol, never the word.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PocketGame = factory();
  }
})(typeof global !== 'undefined' ? global : this, function () {
  'use strict';

  var COLORS = [
    { name: 'RED',    hex: '#ff5d5d', dark: '#7f1d1d', symbol: 'triangle' },
    { name: 'GREEN',  hex: '#3ddc84', dark: '#14532d', symbol: 'circle' },
    { name: 'BLUE',   hex: '#4aa8ff', dark: '#1e3a8a', symbol: 'square' },
    { name: 'YELLOW', hex: '#ffd23f', dark: '#713f12', symbol: 'diamond' }
  ];

  var SLOT_COUNT = 4;
  var START_HEARTS = 3;
  var BASE_POINTS = 10;
  var COMBO_CAP = 10;         // max bonus points from combo (2 per step)
  var COMBO_STEP = 2;         // bonus added per combo level
  var PRESS_LOCKOUT = 0.18;   // seconds; prevents accidental double input
  var ROUND_TIME = 30;        // seconds; whole-round countdown (classic)
  var MARATHON_TIME = 60;     // seconds; whole-round countdown in Marathon
  var MARATHON_STEP = 0.05;   // seconds; Marathon floor relaxation per 10 correct
  var MARATHON_FLOOR = 0.5;   // seconds; absolute lowest Marathon answer timer
  var TIMER_MAX = 2.5;        // generous initial per-target timer
  var TIMER_MIN = 0.9;        // shrinks toward this as score rises
  var TIMER_MIN_SCORE = 180;  // score at which the minimum is reached
  var CONFUSION_BONUS = 0.15; // extra seconds on hue-family traps
  // Genuine Stroop confusables (warm/cool hue pairs): RED<->YELLOW, GREEN<->BLUE.
  var HUE_FAMILY = [3, 2, 1, 0];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** RNG-safe index in [0,n): guards against Math.floor(1.0*n) === n. */
  function pickIndex(random, n) {
    var i = Math.floor(random() * n);
    if (!(i >= 0 && i < n)) i = 0; // NaN/negative from a broken RNG
    if (i >= n) i = n - 1;         // random() === 1 edge
    return i;
  }

  /**
   * Pick a target slot without repeating the previous one, and pick a
   * Stroop word that conflicts at least half the time. Conflicts bias
   * toward the hue-family partner (the genuinely confusable pair) and
   * family traps get slightly more time so difficulty comes from the
   * confusion itself, not from unfair timing.
   */
  function nextTarget(prev, random) {
    var slot = pickIndex(random, SLOT_COUNT);
    if (slot === prev) slot = (slot + 1) % SLOT_COUNT; // no immediate repeats
    // ~50% of the time the word names a DIFFERENT color (the Stroop trap).
    var word = slot;
    var confusable = false;
    if (random() < 0.5) {
      if (random() < 0.6) {
        word = HUE_FAMILY[slot]; // the true look-alike color
        confusable = true;
      } else {
        word = pickIndex(random, SLOT_COUNT - 1);
        if (word >= slot) word += 1;
        if (word >= SLOT_COUNT) word = SLOT_COUNT - 1;
      }
    }
    return { slot: slot, word: word, confusable: confusable };
  }

  /**
   * Per-answer timer for a score. The linear ramp keeps its slope past
   * TIMER_MIN_SCORE but bottoms out at `floor` (TIMER_MIN unless a mode
   * relaxes it — Marathon lowers its floor as correct answers stack up).
   * With the default floor this matches the old clamped ramp exactly.
   */
  function timerFor(score, floor) {
    var t = score / TIMER_MIN_SCORE;
    if (!(t > 0)) t = 0; // NaN / negative guard
    var lo = typeof floor === 'number' ? floor : TIMER_MIN;
    return Math.max(TIMER_MAX - t * (TIMER_MAX - TIMER_MIN), lo);
  }

  function comboBonus(combo) {
    return Math.min(combo * COMBO_STEP, COMBO_CAP);
  }

  /**
   * createGame(opts)
   *   opts.random  function () -> [0,1). Required-ish; defaults to a
   *                deterministic LCG so the core stays deterministic.
   *   opts.mode    'sudden' (one heart, first miss ends) or 'marathon'
   *                (60s round, relaxing answer-timer floor); anything
   *                else plays classic. Unlock gating is app-side.
   *   opts.hearts / opts.timerMax / opts.timerMin / opts.lockout overrides.
   */
  function createGame(opts) {
    opts = opts || {};
    var random = typeof opts.random === 'function'
      ? opts.random
      : function () { // deterministic fallback LCG
          var s = 123456789;
          return function () {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
          };
        }();

    // Mode is core-pure: no gating, no persistence, no ambient input.
    var mode = opts.mode === 'sudden' || opts.mode === 'marathon'
      ? opts.mode
      : 'classic';
    // Sudden Death is one-heart play: the first miss of any kind ends it.
    var hearts = mode === 'sudden'
      ? 1
      : (typeof opts.hearts === 'number' ? opts.hearts : START_HEARTS);
    var lockout = typeof opts.lockout === 'number' ? opts.lockout : PRESS_LOCKOUT;
    var roundTime = mode === 'marathon' ? MARATHON_TIME : ROUND_TIME;

    var phase = 'idle';    // idle | playing | paused | over
    var score = 0, combo = 0, bestCombo = 0, heartsLeft = hearts;
    var correctCount = 0;  // correct answers this round; drives Marathon's floor
    var roundTimeLeft = roundTime; // whole-round countdown
    var targetSlot = -1, targetWord = -1;
    var targetConfusable = false;
    var timeLeft = 0, timeTotal = 0;
    var lockTimer = 0;     // >0 while input is ignored
    var lastOutcome = null; // { hit, slot, points, reason }

    /** Answer-timer lower bound: Marathon relaxes it MARATHON_STEP per 10
     *  correct answers, clamped at MARATHON_FLOOR. Other modes keep
     *  TIMER_MIN; wrong answers never move it. */
    function modeFloor() {
      if (mode !== 'marathon') return TIMER_MIN;
      return clamp(TIMER_MIN - MARATHON_STEP * Math.floor(correctCount / 10),
        MARATHON_FLOOR, TIMER_MIN);
    }

    function freshTarget() {
      var t = nextTarget(targetSlot, random);
      targetSlot = t.slot;
      targetWord = t.word;
      targetConfusable = t.confusable;
      timeTotal = timerFor(score, modeFloor()) + (t.confusable ? CONFUSION_BONUS : 0);
      timeLeft = timeTotal;
    }

    function endRound() {
      phase = 'over';
    }

    var api = {
      /** Begin (or restart) a round. */
      start: function () {
        phase = 'playing';
        score = 0; combo = 0; bestCombo = 0; heartsLeft = hearts;
        correctCount = 0;
        roundTimeLeft = roundTime;
        targetSlot = -1; targetWord = -1;
        targetConfusable = false;
        timeLeft = 0; timeTotal = 0; lockTimer = 0;
        lastOutcome = null;
        freshTarget();
      },

      /** Advance the simulation by dt seconds. dt is clamped >= 0. */
      update: function (dt) {
        if (typeof dt !== 'number' || !isFinite(dt) || dt < 0) dt = 0;
        if (phase !== 'playing') return;
        if (lockTimer > 0) {
          lockTimer -= dt;
          if (lockTimer < 0) lockTimer = 0;
        }
        // Whole-round countdown: always ticks while playing, ends the
        // round at 0 regardless of hearts/score.
        roundTimeLeft -= dt;
        if (roundTimeLeft <= 0) {
          roundTimeLeft = 0;
          endRound();
          return;
        }
        timeLeft -= dt;
        // Consume every expiry contained in dt (handles large frames):
        // each expiry costs a heart, advances the target and carries the
        // leftover negative time into the new target's timer.
        while (timeLeft <= 0 && phase === 'playing' && roundTimeLeft > 0) {
          heartsLeft -= 1;
          combo = 0;
          lastOutcome = { hit: false, slot: -1, points: 0, reason: 'expired' };
          if (heartsLeft <= 0) {
            heartsLeft = 0;
            endRound();
            return;
          }
          var carry = timeLeft; // negative
          freshTarget();
          timeLeft = timeTotal + carry;
        }
        if (timeLeft < 0) timeLeft = 0;
      },

      /**
       * Press a button slot 0..3. Returns:
       *   { hit:true,  points }          correct match
       *   { hit:false, points:0 }        wrong match (costs a heart)
       *   { ignored:true }               out of range / locked / not playing
       */
      pressSlot: function (slot) {
        if (slot !== (slot | 0) || slot < 0 || slot >= SLOT_COUNT) {
          return { ignored: true };
        }
        if (phase !== 'playing') return { ignored: true };
        if (lockTimer > 0) return { ignored: true };

        lockTimer = lockout;
        if (slot === targetSlot) {
          combo += 1;
          if (combo > bestCombo) bestCombo = combo;
          correctCount += 1;
          var pts = BASE_POINTS + comboBonus(combo - 1);
          score += pts;
          lastOutcome = { hit: true, slot: slot, points: pts, reason: 'match' };
          freshTarget();
          return { hit: true, points: pts };
        }
        // wrong
        heartsLeft -= 1;
        combo = 0;
        lastOutcome = { hit: false, slot: slot, points: 0, reason: 'wrong' };
        if (heartsLeft <= 0) {
          heartsLeft = 0;
          endRound();
          return { hit: false, points: 0 };
        }
        freshTarget();
        return { hit: false, points: 0 };
      },

      /** Keyboard helper: keys '1'..'4' -> slots 0..3; others ignored. */
      keyPress: function (k) {
        var n = typeof k === 'string' ? k.charCodeAt(0) - 49 : -1;
        if (n < 0 || n >= SLOT_COUNT) return { ignored: true, hit: false };
        return api.pressSlot(n);
      },

      pause: function () { if (phase === 'playing') phase = 'paused'; },
      resume: function () { if (phase === 'paused') phase = 'playing'; },

      /** Immutable snapshot for renderers, tests and QA hooks. */
      getState: function () {
        return {
          phase: phase,
          mode: mode,
          score: score,
          best: 0, // filled by the app layer (localStorage); core stays pure
          hearts: heartsLeft,
          maxHearts: hearts,
          combo: combo,
          bestCombo: bestCombo,
          correctCount: correctCount,
          roundTimeLeft: roundTimeLeft,
          targetIndex: targetSlot,
          targetWord: targetWord,
          targetConfusable: targetConfusable,
          targetTimeLeft: timeLeft,
          targetTimeTotal: timeTotal,
          lastOutcome: lastOutcome
            ? { hit: lastOutcome.hit, slot: lastOutcome.slot, points: lastOutcome.points, reason: lastOutcome.reason }
            : null
        };
      },

      /** Score needed for the timer to hit its floor (UI hint). */
      timerFloorScore: TIMER_MIN_SCORE
    };

    return api;
  }

  return {
    createGame: createGame,
    COLORS: COLORS,
    SLOT_COUNT: SLOT_COUNT,
    START_HEARTS: START_HEARTS,
    BASE_POINTS: BASE_POINTS,
    COMBO_CAP: COMBO_CAP,
    PRESS_LOCKOUT: PRESS_LOCKOUT,
    TIMER_MAX: TIMER_MAX,
    TIMER_MIN: TIMER_MIN,
    TIMER_MIN_SCORE: TIMER_MIN_SCORE,
    CONFUSION_BONUS: CONFUSION_BONUS,
    HUE_FAMILY: HUE_FAMILY,
    ROUND_TIME: ROUND_TIME,
    MARATHON_TIME: MARATHON_TIME,
    MARATHON_STEP: MARATHON_STEP,
    MARATHON_FLOOR: MARATHON_FLOOR
  };
});
