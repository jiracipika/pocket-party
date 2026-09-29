/* Pocket Party: Donut Dash — local-only meta helpers (S5).
 * Pure ES5, no DOM / clock / storage: the app passes date strings and plain
 * data, so seeds and history transforms are fixture-testable in node. */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.DonutMeta = factory();
  }
})(typeof global !== 'undefined' ? global : this, function () {
  'use strict';

  // FNV-1a over the date string -> uint32 seed for the daily run.
  function seedFromDate(dateStr) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // History ring: one best-meters entry per day key, sorted by day, capped.
  // Entries are {d: 'YYYY-MM-DD', m: meters}; missing days are simply absent
  // (the chart renders gaps). Returns a NEW array; never mutates the input.
  function pushHistory(history, dayKey, meters) {
    var next = [];
    var replaced = false;
    for (var i = 0; i < history.length; i++) {
      var e = history[i];
      if (e.d === dayKey) {
        replaced = true;
        next.push({ d: dayKey, m: Math.max(e.m, meters) });
      } else {
        next.push({ d: e.d, m: e.m });
      }
    }
    if (!replaced) next.push({ d: dayKey, m: meters });
    next.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    return next.slice(-30); // ring cap; charts read the last 7
  }

  // The two launch missions (S5). Each gets the run summary the app already
  // has at recap time and returns whether it is now complete.
  var MISSIONS = [
    { id: 'm300', label: 'Reach 300m without crashing', check: function (r) { return r.meters >= 300 && r.hits === 0; } },
    { id: 'chain15', label: 'Collect 15 snacks in one chain', check: function (r) { return r.bestChain >= 15; } }
  ];

  // Done-map is {missionId: dayKey-of-completion}; returns a new object.
  function evaluateMissions(done, run) {
    var next = {};
    for (var k in done) if (Object.prototype.hasOwnProperty.call(done, k)) next[k] = done[k];
    for (var i = 0; i < MISSIONS.length; i++) {
      var m = MISSIONS[i];
      if (!next[m.id] && m.check(run)) next[m.id] = run.dayKey;
    }
    return next;
  }

  return {
    seedFromDate: seedFromDate,
    pushHistory: pushHistory,
    MISSIONS: MISSIONS,
    evaluateMissions: evaluateMissions,
    VERSION: '1.0.0'
  };
});
