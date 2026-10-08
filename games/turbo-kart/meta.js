/* Pocket Party: Turbo Kart — local-only meta helpers.
 * Pure ES5, no DOM / clock / storage: the app passes date strings and plain
 * data, so seeds and history transforms are fixture-testable in node. */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.TurboMeta = factory();
  }
})(typeof global !== 'undefined' ? global : this, function () {
  'use strict';

  // FNV-1a over the date string -> uint32 seed for the daily time-trial track.
  function seedFromDate(dateStr) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // History ring: one best-score entry per day key, sorted by day, capped.
  // Entries are {d: 'YYYY-MM-DD', s: score}; returns a NEW array.
  function pushHistory(history, dayKey, score) {
    var next = [];
    var replaced = false;
    for (var i = 0; i < history.length; i++) {
      var e = history[i];
      if (e.d === dayKey) {
        replaced = true;
        next.push({ d: dayKey, s: Math.max(e.s, score) });
      } else {
        next.push({ d: e.d, s: e.s });
      }
    }
    if (!replaced) next.push({ d: dayKey, s: score });
    next.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    return next.slice(-30);
  }

  return {
    seedFromDate: seedFromDate,
    pushHistory: pushHistory,
    VERSION: '1.0.0'
  };
});
