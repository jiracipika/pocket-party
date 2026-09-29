# Balloon Bank

The fifth Pocket Party game — the collection's hold-and-release verb and its
first risk/reward loop. Hold anywhere (or hold **Space**) to pump the balloon;
release to bank it. Every balloon hides a pop threshold; pump past it and it
bursts: one heart and your bank chain, gone.

Open `index.html` in any browser, or serve the folder:

```
cd games/balloon-bank && python3 -m http.server 8126
# http://localhost:8126/index.html   (add ?qa=1 for the QA hook)
```

## Rules (30-second round, 3 hearts)

- **Hold** pumps the balloon: +85px of radius per second (cap: the hidden
  threshold). **Release** banks it: `ceil((radius / 150)^2 * 100)` points —
  quadratic, so small banks are barely worth it and max banks are prized.
- **Chain**: consecutive banks pay x2 from the 3rd and x3 from the 6th; a pop
  resets the chain. The HUD badge previews what your next bank will pay.
- **Idle leak**: an unbanked balloon deflates at 14px/s down to its fresh size,
  so waiting has a cost.
- **Pop**: pumping past the hidden threshold (45–95% of max radius, re-rolled
  every balloon) costs a heart and the chain; the balloon respawns after 250ms.
- **Creak warning**: guaranteed by test to engage at least **250ms before the
  earliest possible pop** — when you hear/see it, banking is still safe,
  pumping more may not be.
- **Special balloons** (S4, weights via injected rng, never in the final 2s):
  **golden** (10%, from the 3rd bank onward) pays **3x** with a ~20% narrower
  pop window; **quick-leak** (15%) deflates 3x faster while idle; **heart**
  (rare, only while hurt, max one per heart lost) restores a heart when banked
  at >= 80% of max radius. Each type wears its own color: sky, gold, pink,
  green.
- Round expiry or 0 hearts ends the run. Recap: banks, biggest bank, pops,
  best chain, new-best flag.

## Files

- `core.js` — pure ES5 UMD game core (same contract as the siblings): no DOM,
  no clock, no ambient randomness; time enters via `update(dt)`, randomness is
  injected (`createGame({ rng })`). Both the browser app and the future Lens
  controller run this exact code.
- `app.js` — browser UI: canvas renderer, hold input (pointer + Space),
  procedural WebAudio (pump ticks rising with size, creak, pop, bank chime),
  HUD, overlays, share with copy fallback, `?qa=1` test hook.
- `core.test.cjs` — 16 deterministic fixtures: pump/leak rates, threshold pop,
  quadratic payout, chain tiers, warning-contract lead time, determinism.

## QA hook

Load `index.html?qa=1` and use `window.__gameTest`:
`getState()`, `start()`, `hold(true|false)`, `bank()`, `pause()`, `resume()`,
`forceOver()`, plus direct `game` access. Absent without the query flag.

## Local data

`balloon-bank-best` (guarded localStorage) and `balloon-bank-muted`. No
leaderboard, no sign-ups — personal bests stay on this device.

## Status

Browser playable (S1-S4 complete, 2026-09-29: specials live). Landing
integration and the browser-suite block are live (S3). Native lens project: not assembled yet —
S6 covers it, and **nothing here is device-validated** (S7 gates, including
the hold-vs-Snapchat-long-press check, are user-manual).
