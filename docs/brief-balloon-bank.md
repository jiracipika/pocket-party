# Balloon Bank — product brief (added 2026-09-27)

The fifth Pocket Party game. Status: **designed, not yet built** — Slice S1 in
`docs/slices/balloon-bank.md` creates the folder. This brief is the durable
spec; the slice plan is the delivery schedule. (Donut Dash joined as the
fourth game via commit `2b4626a` — see `docs/brief-donut-dash.md`.)

## Why this game

Pocket Party already covers four input verbs:

| Game | Input verb | Pressure source |
|---|---|---|
| Snack Catch | drag / steer | falling items, bombs |
| Stack Rush | tap-to-time | shrinking overlap |
| Color Panic | reaction-choice | per-target countdown |
| Donut Dash | tap-to-jump (double) | scrolling obstacles |
| **Balloon Bank** | **hold-and-release** | **self-inflicted risk** |

Hold-and-release is the missing verb, and it produces the family's first
risk/reward loop: every point is earned by *choosing* when to stop.

## Concept

One balloon sits on a pump pad. **Hold anywhere to pump** — the balloon grows.
**Release to bank it** — points fly in proportional to size. Every balloon
hides a pop threshold; pump past it and it bursts: you lose a heart and the
chain. Bigger is worth more; greed is the mechanic.

- 30-second round, 3 hearts (family parity: `ROUND_MS = 30000`).
- Unbanked balloons slowly leak, so idling has a cost.
- Banking a balloon at chain size 3 grants x2, chain 6 grants x3; a pop resets the chain.
- Special balloons (from S4): golden (3x, tighter window), quick-leak (shrinks
  3x faster), heart refill (rare, only when hurt, full size to claim).

## Core model (deterministic, testable)

- ES5 UMD `core.js`, injected RNG, zero DOM/window/Date dependencies — same
  contract as the other three cores (see `docs/brief-snack-catch.md` rules).
- Per-balloon hidden threshold `T = minT + rng() * (maxT - minT)` as a fraction
  of max radius; `PUMP_RATE` px/s growth; `LEAK_RATE` px/s decay while idle.
- Warning contract (S3 enforces by test): the creak/wobble warning must become
  perceptible at least **250 ms before the earliest possible pop** at
  `PUMP_RATE` — no unpunishable surprises.
- Banking: `points = ceil((radius / R_MAX)^2 * 100) * chainMultiplier`
  (quadratic — small banks are barely worth it, max banks are prized).
- Pop: heart loss, burst event, chain reset; balloon respawn after 250 ms.
- Round expiry or 0 hearts ends the run; recap shows banks, biggest single
  bank, pops, best chain, new-best detection.
- State snapshot for tests/QA: phase, radius, threshold (tests only), score,
  hearts, chain, timeLeft, banks, pops.

## Browser UX requirements (family tokens)

`#0a0a0f` bg, `#1c1c2e` cards, white text, accent **sky `#7ddcff`**. Hold
input on the whole canvas (44px+ target trivially met), hold-Space on desktop,
P pause, M mute. Procedural WebAudio: pump tick rising with size, creak warning,
pop burst, bank chime. Reduced-motion: static wobble, no shake. Guarded
localStorage keys `balloon-bank-best`, `balloon-bank-muted`. Pause on
visibilitychange. Share via `navigator.share` with copy fallback — no
fabricated leaderboards. QA hook `window.__gameTest` under `?qa=1`.

## Native (Lens) notes

Same generated-controller pattern as the siblings (`scripts/build-lenses.cjs`
registry gains `balloon-bank`; embedded core verbatim). Hold = `TouchStart` /
`TouchEnd` on PlayArea; balloon = one Screen Image the controller scales;
HUD/panels identical to the existing three scenes. **Known risk, owned by S7:**
Snapchat's own long-press gestures may conflict with a sustained hold — S7
tests it on device and the controller carries a documented tap-pump fallback
(each tap = one pump stroke, threshold unchanged) toggled by an input.

## Acceptance ladder (every slice)

`npm ci → npm test → npm run build → npm run test:browser` green; no runtime
deps; no native/device/publish validation claims before the S7/S8 gates in
`docs/SNAPCHAT-HANDOFF.md`.
