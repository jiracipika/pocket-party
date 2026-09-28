# Pocket Party — Snapchat games roadmap (2026-09-27)

Master index for the five games and their 8-slice update plans. Per-game
detail lives in `docs/slices/<slug>.md`; durable specs live in
`docs/brief-*.md`. The original build log and worker ownership stay in
`docs/PLAN.md` (historical).

## Repository contract — one collection, one app per game

This repo is the Snapchat-games collection. Every game is a self-contained app
under `games/<slug>/` and every game gets its own native Lens Studio project
under `lens-projects/<slug>-lens/`:

    pocket-party/                  ← the "Snapchat games" collection
    ├─ games/
    │  ├─ snack-catch/             ← self-contained app: index.html, style.css,
    │  ├─ stack-rush/                app.js, core.js, core.test.cjs, README,
    │  ├─ color-panic/               and lens/ (controller + SETUP guide)
    │  ├─ donut-dash/              ← arrived via commit 2b4626a (pulled 2026-09-27)
    │  └─ balloon-bank/            ← arrives at its S1 (designed, docs/brief-balloon-bank.md)
    ├─ lens-projects/
    │  ├─ color-panic-lens/        ← native Lens Studio project per game
    │  ├─ snack-catch-lens/        ←   (assembled 2026-09-26, preview-clean)
    │  ├─ stack-rush-lens/         ←   (assembled 2026-09-26, preview-clean)
    │  └─ donut-dash-lens/         ←   (assembled 2026-09-28, preview-clean)
    ├─ native/                     ← shared adapter docs + README (donut-dash branch included)
    ├─ scripts/                    ← build, lens generation, browser + playability tests
    └─ docs/                       ← briefs, handoff, slices/, this roadmap

Rules that keep this sane: game folders never import from each other; shared
code lives in scripts/native tooling only; each slice keeps the whole ladder
green (`npm ci → npm test → npm run build → npm run test:browser`).

## The uniform slice arc

All four plans follow the same arc so any slice number means the same thing:
**S1** feel/juice or scaffold → **S2** fairness/difficulty (core, fixture-tested)
→ **S3** feature → **S4** variety/economy → **S5** meta/retention (local-only)
→ **S6** native parity (Lens project) → **S7** device validation (real gates,
never claimed done) → **S8** submission-ready. Browser slices keep the whole
test suite green after each one; core-touching slices regenerate the lens
controllers (see engineering rules below).

## Master slice table

Detailed, grounded plans: [snack-catch](slices/snack-catch.md) ·
[stack-rush](slices/stack-rush.md) · [color-panic](slices/color-panic.md) ·
[donut-dash](slices/donut-dash.md) · [balloon-bank](slices/balloon-bank.md)

| Game | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| Snack Catch | Feel: shake, squash, telegraphs | Fairness: bomb distance guarantee, FALL_MAX clamp, first-5s grace | Power-ups: golden/shield/slow-mo | Combo audio + honest stats | Daily seed, 7-day chart, missions | Textured items/basket, native juice + audio | Device gates: safe areas, drag vs Snapchat gestures, 24-item pool | Icon, video, Snapcode, QA ladder |
| Stack Rush | Feel: landing squash, perfect flash (+ viewH cull fix landed 2026-09-27) | Ramp audit table, ≥110ms first-3 floor, MAX_SPEED 300, alternating spawns | Streak multiplier x2/x3, high-drop bonus | Best-score palettes | Best-run ghost, history chart, share upgrade | White→tinted 24-material ramp, landing flash, audio | Device gates: readability, tap zones vs chrome, 24-layer pool | Icon, video, Snapcode, QA ladder |
| Color Panic | Feel: ring burst tiers, wrong-answer flash, token transitions | Confusion model: hue-family traps + CONFUSION_BONUS window, pairing fixtures, ?hc palette | Modes: Sudden Death + Marathon (unlock best ≥ 20) | Freeze + double-points tokens (guarded last 2s) | Response-ms + per-color weakness, history sparkline | Per-color materials + glyph PNGs, dark token backdrop | Device gates: one-hand 2x2 reach, outdoor ink legibility, 0.9s floor at touch latency | Icon, video, Snapcode, QA ladder |
| Donut Dash | Feel: jump squash, land dust, double-jump flip, crash shake | Ramp reaction-window table, no-impossible-sandwich fixture, SPEED_MAX check | Snack trails on jump arcs + chain multiplier | Golden donut, shield, magnet, spring crate | Best-distance ghost flag, daily seed, missions | Assemble donut-dash-lens via MCP (adapter branch exists), tinted materials | Device gates: tap-to-jump vs touch blocking, double-jump at touch latency, speed legibility | Icon, video, Snapcode, QA ladder |
| Balloon Bank | Scaffold + tested core (grow/leak/pop/bank/chain) | Full browser game with hold juice | Landing card + suite 4→5 games | Golden/quick-leak/heart balloons, chain x2/x3 | Risk-profile stats, daily seed, 7-day chart | Generator registry + native scene assembly via MCP | **Hold vs Snapchat long-press** (headline risk), tap-pump fallback | Icon, video, Snapcode, QA ladder |

Effort totals per game (from the slice docs): Snack Catch S/M/M/S/M/L/L/S ·
Stack Rush M/M/M/S/M/M/L/S · Color Panic M/M/M/M/M/L/M/M · Donut Dash
M/M/M/M/M/L/L/S · Balloon Bank L/L/M/M/M/L/L/S.

## Shared engineering rules (apply to every slice)

1. **Core change ⇒ regenerate lenses.** `tests/native-adapter.test.cjs`
   enforces exact core-embed equality: after any `games/*/core.js` edit run
   `node scripts/build-lenses.cjs` and re-verify the native preview
   (RunAndCollectLogsTool → no script errors) per the MCP flow recorded in
   `docs/SNAPCHAT-HANDOFF.md`.
2. **Landing count assertions.** `scripts/browser-test.cjs` asserts the landing
   page game count and per-game blocks — Balloon Bank's S3 updates both in the
   same slice so the suite never goes red.
3. **QA hooks.** Each game exposes `window.__gameTest` only under `?qa=1`;
   slice acceptance criteria should drive real browser interactions through it
   (see `scripts/playability-live.cjs` for the pattern).
4. **Honesty gates.** No slice may claim device validation, native parity, or
   publication before its S7/S8 exit criteria are recorded in
   `docs/SNAPCHAT-HANDOFF.md`. Submission is always the user's manual step via
   their Snap account.
5. **One-app-per-folder.** Game folders don't import each other; shared
   tooling lives in `scripts/` and `native/`.

## Known backlog (pre-slice fixes already identified)

- ✅ FIXED 2026-09-27: Stack Rush tall-screen layer cull (`app.js` culled at
  `LOGICAL_H` while full-bleed renders `viewH` — bottom layers vanished on
  390×844; now culled against `viewH`, verified by screenshot).
- ✅ FIXED 2026-09-27 (S2 batch, all fixture-locked): Snack Catch `FALL_MAX`
  now enforced (was reaching ~283 px/s) and bombs spawn ≥ 70 px from the
  basket (`BOMB_MIN_BASKET_DIST`); Stack Rush spawn sides strictly alternate
  (never spawn aligned — rapid-tap guard kept), `MAX_SPEED` 340→300 (±8px
  window 50→53.3ms at cap), dead `CAMERA_DEADZONE` removed; Color Panic
  conflicts bias to hue-family traps (RED↔YELLOW, GREEN↔BLUE) with a +0.15s
  `CONFUSION_BONUS` on them (`targetConfusable` in the snapshot for renderers);
  Donut Dash readable-window locked at ≥450ms (measured ~690ms at speed cap)
  and `PLAYER_X`/`SPEED_GAIN` exported. Lenses regenerated; 99 unit + 42
  browser checks green. Remaining S2 work (grace pacing, sandwich fixtures,
  high-contrast palette) lives in each slice doc.
- All three native projects: unused duplicate `GameController N.js` assets to
  delete by hand in Studio; white placeholder materials → per-game S6.
- ✅ 2026-09-28: Donut Dash native scene assembled (`lens-projects/donut-dash-lens/`,
  preview-clean, all inputs wired) — the assembly half of its S6 is done;
  remaining S6 work: tinted materials (player/pool ship white placeholder
  Images). The S2 fixture batch (2026-09-27) regenerated all four
  `games/*/lens/` controllers; the three 2026-09-26 native scenes predate
  that regeneration and need a controller re-import check during their S6
  passes (donut's is current by construction).
- The playability probe (`scripts/playability-live.cjs`) currently covers the
  original three games; add a Donut Dash block (jump-latency + fps sampling)
  during its S1.

## Measured baselines (2026-09-27, headless Chrome 153, 390×844, DPR 2)

From `scripts/playability-live.cjs` → `artifacts/playability-baseline.json`:

| Game | Input latency | FPS | Long frames (>34ms) | Probe bot result |
|---|---|---|---|---|
| Snack Catch | 9.9 ms | 60 flat | 0 | 40 pts, 2 hearts (naive bot oscillates; human reference best 230) |
| Stack Rush | ~14-45 ms | 60 flat | 0 | 180-193 layers — superhuman bot never hits an unwinnable state |
| Color Panic | ~12 ms | 60 flat | 0 | 1800 pts, 2 hearts lost (260ms reaction, perfect accuracy) |

Interpretation: the engines hold 60fps with zero long frames at DPR 2 on the
target viewport, input-to-state latency is well under a frame, and Stack Rush
provably never generates an impossible block at least to layer ~190. The bots
are ceiling probes, not fun-band measures — humane reaction windows and
difficulty bands are exactly what each game's S2 slice pins with fixtures.
Rerun this probe after any feel-affecting slice; S1 slices should not regress
FPS/latency.

## Submission pipeline (per game, at S8)

1. Final QA ladder green; version tag.
2. Original 1024px lens icon + 10-20s vertical preview video (shot lists in
   each S8 section).
3. Native preview clean + device gates recorded (S7 artifacts).
4. User submits through their Snap account; Snapcode + link recorded in docs
   after approval. Until then: never claim published.
