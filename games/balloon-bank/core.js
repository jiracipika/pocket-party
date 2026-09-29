/* Pocket Party: Balloon Bank — deterministic core.
 * Pure ES5 UMD: no DOM, no clock, no ambient randomness — time enters via
 * update(dtMs), randomness is injected (createGame({ rng })). Hold anywhere
 * pumps the balloon; release banks it for points; every balloon hides a pop
 * threshold. Same contract as the other Pocket Party cores. */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.PocketGame = factory();
  }
})(typeof global !== 'undefined' ? global : this, function () {
  'use strict';

  var W = 360, H = 640;          // logical play area
  var ROUND_MS = 30000;          // 30s round
  var HEARTS = 3;

  var R_MIN = 18;                // fresh-balloon radius (also the leak floor)
  var R_MAX = 150;               // radius that earns the top bank payout
  var PUMP_RATE = 85;            // px/s of radius growth while held
  var LEAK_RATE = 14;            // px/s of decay while idle (idling has a cost)

  var THRESHOLD_MIN = 0.45;      // hidden pop threshold, as a fraction of R_MAX
  var THRESHOLD_MAX = 0.95;
  var CREAK_LEAD_S = 0.25;       // creak engages >= 250ms before the earliest pop

  var RESPAWN_MS = 250;          // balloon respawn after a pop
  var BANK_BASE = 100;           // points = ceil((radius/R_MAX)^2 * BANK_BASE) * mult
  var CHAIN_TIER2 = 3;           // consecutive banks for x2
  var CHAIN_TIER3 = 6;           // consecutive banks for x3

  // S4 special balloons (weights via injected rng; none in the final 2s)
  var GOLDEN_CHANCE = 0.10;      // from the 3rd bank onward
  var GOLDEN_MULT = 3;           // golden bank value multiplier (chain still applies)
  var QUICK_CHANCE = 0.15;       // deflates 3x faster while idle
  var QUICK_LEAK_MULT = 3;
  var HEART_CHANCE = 0.08;       // only while hurt; banking at >= 80% radius
  var HEART_BANK_FRACTION = 0.8; //   restores one heart; max 1 per heart lost
  var FINAL_GUARD_MS = 2000;     // no specials in the final 2s

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

  // Bank-chain reward tier for consecutive banks (a pop resets the chain).
  function chainMultFor(banks) {
    return banks >= CHAIN_TIER3 ? 3 : banks >= CHAIN_TIER2 ? 2 : 1;
  }

  function bankPointsFor(radius) {
    var f = clamp(radius / R_MAX, 0, 1);
    return Math.ceil(f * f * BANK_BASE);
  }

  function createGame(opts) {
    opts = opts || {};
    var rng = opts.rng || function () { return 0.5; };
    var g = {
      W: W, H: H,
      state: 'ready',            // ready | playing | paused | over
      score: 0, best: 0,
      hearts: HEARTS,
      chain: 0, bestChain: 0,
      timeLeft: ROUND_MS,
      radius: R_MIN,             // 0 while the balloon respawns
      threshold: 0,              // hidden pop fraction (tests/QA only)
      type: 'normal',            // normal | golden | quick | heart
      creaking: false,           // warning: pop is within CREAK_LEAD_S of pumping
      held: false,
      banks: 0, pops: 0, biggestBank: 0,
      respawnMs: 0,
      heartClaimed: false,       // a heart balloon was claimed since the last hurt
      events: [],                // ['start'|'bank'|'pop'|'heart'|'over', ...]
      _rng: rng
    };

    // Fresh balloon: type roll (deterministic via rng) + hidden threshold.
    // Golden narrows the threshold window ~20%; none in the final 2s.
    function rollBalloon() {
      var t = 'normal';
      if (g.timeLeft > FINAL_GUARD_MS) {
        var r = rng();
        if (g.hearts < HEARTS && !g.heartClaimed && r < HEART_CHANCE) t = 'heart';
        else if (g.banks >= 2 && r < HEART_CHANCE + GOLDEN_CHANCE) t = 'golden';
        else if (r < HEART_CHANCE + GOLDEN_CHANCE + QUICK_CHANCE) t = 'quick';
      }
      g.type = t;
      g.threshold = t === 'golden'
        ? clamp(0.70 + (rng() - 0.5) * (THRESHOLD_MAX - THRESHOLD_MIN) * 0.8, THRESHOLD_MIN, THRESHOLD_MAX)
        : THRESHOLD_MIN + rng() * (THRESHOLD_MAX - THRESHOLD_MIN);
    }
    rollBalloon();

    function leakRate() {
      return g.type === 'quick' ? LEAK_RATE * QUICK_LEAK_MULT : LEAK_RATE;
    }

    function popRadius() { return g.threshold * R_MAX; }

    function pop() {
      g.pops++;
      g.hearts--;
      g.chain = 0;               // a burst resets the bank chain
      g.radius = 0;
      g.respawnMs = RESPAWN_MS;
      g.creaking = false;
      g.heartClaimed = false;    // hurt again: a new heart balloon may appear
      g.events.push(['pop']);
      rollBalloon();
      if (g.hearts <= 0) {
        g.hearts = 0;
        g.state = 'over';
        g.events.push(['over']);
      }
    }

    function update(dtMs) {
      if (g.state !== 'playing' || typeof dtMs !== 'number' || !isFinite(dtMs) || dtMs <= 0) return g;
      var dt = dtMs / 1000;

      g.timeLeft -= dtMs;
      if (g.timeLeft <= 0) {
        g.timeLeft = 0;
        g.state = 'over';
        g.events.push(['over']);
        return g;
      }

      if (g.respawnMs > 0) {
        g.respawnMs = Math.max(0, g.respawnMs - dtMs);
        g.creaking = false;
        return g;                  // no balloon to pump or leak mid-respawn
      }

      if (g.held) {
        g.radius = Math.min(popRadius(), g.radius + PUMP_RATE * dt);
        if (g.radius >= popRadius()) pop();
      } else {
        g.radius = Math.max(R_MIN, g.radius - leakRate() * dt);
      }
      // creak before the earliest possible pop: the warning must leave at
      // least CREAK_LEAD_S of pumping before radius reaches the threshold
      g.creaking = g.radius > 0 && popRadius() - g.radius <= PUMP_RATE * CREAK_LEAD_S;
      return g;
    }

    function bank() {
      if (g.state !== 'playing' || g.respawnMs > 0 || g.radius <= 0) return 0;
      g.chain++;
      if (g.chain > g.bestChain) g.bestChain = g.chain;
      var mult = chainMultFor(g.chain);
      var pts = bankPointsFor(g.radius) * (g.type === 'golden' ? GOLDEN_MULT : 1) * mult;
      var restored = false;
      if (g.type === 'heart' && g.radius >= HEART_BANK_FRACTION * R_MAX && g.hearts < HEARTS) {
        g.hearts++;
        g.heartClaimed = true;    // one heart balloon per heart lost
        restored = true;
      }
      g.score += pts;
      g.banks++;
      if (pts > g.biggestBank) g.biggestBank = pts;
      g.radius = R_MIN;           // fresh balloon
      rollBalloon();
      g.creaking = false;
      g.events.push(['bank', pts, mult, g.type]);
      if (restored) g.events.push(['heart']);
      return pts;
    }

    function setHold(on) { g.held = !!on; }

    function start() {
      g.state = 'playing';
      g.score = 0;
      g.hearts = HEARTS;
      g.chain = 0; g.bestChain = 0;
      g.timeLeft = ROUND_MS;
      g.radius = R_MIN;
      g.held = false;
      g.banks = 0; g.pops = 0; g.biggestBank = 0;
      g.respawnMs = 0;
      g.heartClaimed = false;
      g.events.length = 0;
      g.events.push(['start']);
      rollBalloon();
      g.creaking = false;
      return g;
    }

    function pause() {
      if (g.state === 'playing') { g.state = 'paused'; g.held = false; g.events.push(['pause']); }
      return g.state;
    }
    function resume() {
      if (g.state === 'paused') { g.state = 'playing'; g.events.push(['resume']); }
      return g.state;
    }
    function togglePause() { return g.state === 'paused' ? resume() : pause(); }
    function endRun() {
      if (g.state === 'playing' || g.state === 'paused') {
        g.state = 'over';
        g.events.push(['over']);
      }
      return g.state;
    }
    function takeEvents() { var e = g.events; g.events = []; return e; }

    g.update = update;
    g.bank = bank;
    g.setHold = setHold;
    g.start = start;
    g.pause = pause;
    g.resume = resume;
    g.togglePause = togglePause;
    g.endRun = endRun;
    g.takeEvents = takeEvents;
    g.popRadius = popRadius;
    g.CONST = {
      ROUND_MS: ROUND_MS, HEARTS: HEARTS, R_MIN: R_MIN, R_MAX: R_MAX,
      PUMP_RATE: PUMP_RATE, LEAK_RATE: LEAK_RATE,
      THRESHOLD_MIN: THRESHOLD_MIN, THRESHOLD_MAX: THRESHOLD_MAX,
      CREAK_LEAD_S: CREAK_LEAD_S, RESPAWN_MS: RESPAWN_MS, BANK_BASE: BANK_BASE,
      CHAIN_TIER2: CHAIN_TIER2, CHAIN_TIER3: CHAIN_TIER3,
      GOLDEN_CHANCE: GOLDEN_CHANCE, GOLDEN_MULT: GOLDEN_MULT,
      QUICK_CHANCE: QUICK_CHANCE, QUICK_LEAK_MULT: QUICK_LEAK_MULT,
      HEART_CHANCE: HEART_CHANCE, HEART_BANK_FRACTION: HEART_BANK_FRACTION,
      FINAL_GUARD_MS: FINAL_GUARD_MS
    };
    return g;
  }

  return {
    createGame: createGame,
    mulberry32: mulberry32,
    clamp: clamp,
    chainMultFor: chainMultFor,
    bankPointsFor: bankPointsFor,
    VERSION: '1.0.0'
  };
});
