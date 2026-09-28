# Snack Catch — 8-slice update plan (2026-09-27)

Status today: the browser game in `games/snack-catch/` is complete and green — drag-basket (pointer + arrows/A,D), 30s round (`ROUND_MS = 30000`), 3 hearts (`HEARTS`), bombs cost a heart and reset combo, combo every `COMBO_STEP = 5` catches up to `MAX_MULT = 3`, mint accent `#7dffb2`, sprite atlas `assets/snack-sprites.png` with primitive fallback, procedural WebAudio with mute persistence (`snack-catch-muted`), pause/resume/visibility/replay/share/local best (`snack-catch-best`), and a full-bleed QA hook (`window.__gameTest` under `?qa=1`). Repo-wide 66 unit + 30 browser checks are green. Native: `lens-projects/snack-catch-lens/` has an MCP-assembled scene in Lens Studio 5.24 with every `GameController.js` `@input` wired, preview runs with no script errors (two benign "api is deprecated" warnings), per `docs/SNAPCHAT-HANDOFF.md` (status 2026-09-26). Still open and honestly NOT done: duplicate "GameController 2" asset cleanup, white placeholder materials on basket/items, and ALL device verification (handoff checklist items 4–6). Nothing is submitted, approved, or claimed published.

| Slice | Name | One-line goal | Effort |
|---|---|---|---|
| S1 | Feel & Juice | Catch/miss/bomb feedback: shake, squash-and-stretch, combo popup, spawn telegraphs — no core rule changes | M |
| S2 | Fairness & Difficulty | Expose/validate ramp constants, bomb-spawn distance guarantee, first-5s grace, new deterministic fixtures | M |
| S3 | Feature: Power-Ups | Golden snack (3x pts), shield (absorbs one bomb), slow-mo star (5s) — weights, expiry, HUD, tests | L |
| S4 | Variety & Economy | Combo pitch-scaled audio, honest best-combo stat, per-run stat capture for history | S |
| S5 | Meta & Retention | Daily challenge seed, last-7-days best chart, session stats, mission nudges — local-only | M |
| S6 | Native Parity | Replace white materials with textured items/basket, native-safe juice + audio, controller regeneration | L |
| S7 | Device Validation | Safe areas, drag vs Snapchat touch blocking, capture-button reachability, performance — the real gates | L |
| S8 | Submission-Ready | 1024px icon, 10–20s preview video, Snapcode, full QA ladder, version tag; submission is the user's manual step | S |

---

## S1 — Feel & Juice (browser)

- **Goal:** Make catches, misses and bombs physically felt without touching any core rule. All feedback derives from events the core already emits (`catch`, `miss`, `bomb`, `combo`, `spawn`).
- **Files changed:** `games/snack-catch/app.js`, `games/snack-catch/index.html`, `games/snack-catch/style.css`. No `core.js`/`core.test.cjs` edits.
- **Implementation steps:**
  - Screen shake on bomb: short decaying canvas offset (~150 ms, ≤8 logical px) applied as a `ctx.translate` inside `draw()`; driven by the `bomb` event in `playEvents()`.
  - Basket squash-and-stretch: scale `drawBasket()` around the catch line (`basket.y - basket.h/2`) on catch (squash) and bomb (recoil), springing back over ~180 ms. Core hitbox `CATCH_R` untouched — visual only.
  - Combo popup: the static `xN combo` text drawn at y=44 in `draw()` gets a pop-scale + fade per `combo` event tier.
  - Spawn telegraphs: on each `spawn` event draw a faint mint tick at the top edge at spawn x for ~250 ms, so late-round fast falls are readable.
  - Miss feedback: brief red edge flash on `miss` (today it only plays the quiet 210 Hz `sfx.miss` blip).
  - Extend `window.__gameTest` with a `getFx()` getter (shake/squash/telegraph lifetimes) so QA can assert juice under `?qa=1` without changing the existing hook surface.
- **Acceptance criteria:**
  - `npm test` stays green (66 unit tests; zero core edits in this slice) and `node --check games/snack-catch/app.js` passes.
  - `npm run test:browser` still passes (30 checks; `scripts/browser-test.cjs` is parent-owned — S1 must not need to edit it).
  - Reduced motion: `reduceMotion` (already read from `prefers-reduced-motion` in `app.js`) gates shake/squash/telegraph the same way `burst()` already early-returns; verified by code inspection + `?qa=1` check.
  - Particles/FX stay bounded (all lifetimes ≤ 0.8 s) so the fixed-timestep loop (`while (accMs >= 16) game.update(16)`) never backlogs.
- **Native impact:** None (browser-only). The event vocabulary used here already reaches the generated controller, so S6 can mirror these effects without core changes.
- **Effort:** M

## S2 — Fairness & Difficulty (core)

- **Goal:** Make the difficulty ramp honest: expose the constants, enforce the advertised fall-speed cap, guarantee bombs don't spawn on top of the basket, and give the first 5 seconds a grace window.
- **Files changed:** `games/snack-catch/core.js`, `games/snack-catch/core.test.cjs`, regenerated `games/snack-catch/lens/GameController.js`.
- **Implementation steps:**
  - Extend `g.CONST` (currently only `ROUND_MS, HEARTS, MAX_MULT, COMBO_STEP, FALL_MAX`) with `FALL_BASE = 145`, `SPAWN_MIN = 0.45`, `SPAWN_MAX = 0.85`, `CATCH_R = 26`, `ITEM_R = 13`, and bomb-ratio bounds `0.18 → 0.28`.
  - Fix the `FALL_MAX` overshoot: at `prog = 1`, `spawn()` computes `145 + 115 * (0.8..1.2) = 237..283 px/s`, so the `FALL_MAX = 260` "px/sec cap" comment (core.js) is not enforced. Clamp final speed to `FALL_MAX`.
  - Bomb-spawn fairness: when `isBomb` is rolled, re-roll x (same injected rng) until `|x - g.basket.x| >= MIN_BOMB_X_DIST` (new constant, ~70 logical px ≈ `CATCH_R + ITEM_R + margin`). The guarantee is at spawn time; the player can still drag into a bomb.
  - Grace pacing: while `elapsedPrivate() < 5000`, force the bomb ratio to 0 (escalation starts after 5 s); keep the existing first-spawn `_spawnTimer = 0.35`.
  - New deterministic fixtures in `core.test.cjs`: (a) seeded 30 s run where every bomb satisfies the spawn-distance rule; (b) zero bombs while elapsed < 5000 across several seeds; (c) all spawn speeds ≤ `g.CONST.FALL_MAX` after the clamp; (d) `g.CONST` exposes the new constants.
- **Acceptance criteria:**
  - `node --test games/snack-catch/core.test.cjs` green with the 4 new fixtures; the existing 14 tests unmodified and green (bomb-heart fixture pattern at "bomb costs a heart, 3 bombs ends game" stays as-is).
  - Full `npm test` green, including `tests/parent-regressions.test.cjs`.
  - `npm run build:lenses` run so the embedded core in `lens/GameController.js` matches `core.js` verbatim — otherwise `tests/native-adapter.test.cjs` fails its exact-source-equality check (per `games/snack-catch/lens/SETUP.md`).
- **Native impact:** Rule change reaches native only via regeneration; after rebuilding, re-wire nothing (inputs unchanged) but re-run the Lens Studio preview and confirm no script errors. Native gameplay becomes fairer; no input or scene changes.
- **Effort:** M

## S3 — Feature: Power-Ups (core + browser)

- **Goal:** Three deterministic power-ups — golden snack (3x points), shield (absorbs one bomb), slow-mo star (5 s) — with spawn weights, expiry, HUD indicators and tests.
- **Files changed:** `games/snack-catch/core.js`, `games/snack-catch/app.js`, `games/snack-catch/index.html`, `games/snack-catch/style.css`, `games/snack-catch/core.test.cjs`, regenerated controller.
- **Implementation steps:**
  - Spawn weights: after the normal snack/bomb roll in `spawn()`, upgrade a snack to a power-up with `POWERUP_CHANCE` (~0.06) only when no power-up is airborne and a `POWERUP_COOLDOWN` (~8 s) has elapsed; never during the first-5s grace (S2); bombs never upgrade. Kind chosen by one `rng()` call: `golden`, `shield`, `slow`.
  - Effects (deterministic, event-emitting): golden → `score += 30 * g.multiplier` + `powerup` event; shield → `g.shield = true`, bomb branch consumes the shield before `hearts--` and emits a `shield` event (combo survives); slow → `g.slowLeft = 5000`, item motion scaled 0.5 while it counts down in real time (round still ends at `ROUND_MS`).
  - Expiry: shield persists until consumed or round end; slow-mo decays; power-ups missed off-screen just vanish (no combo break).
  - HUD: power-up chip row in `index.html` (shield icon + slow-mo countdown) wired in `syncHud()`; golden uses the warm-yellow palette (`#ffe66d`) in both sprite-fallback and primitive paths; shield ring drawn on the basket.
  - Tests: hand-placed fixtures over the basket (same pattern as the existing bomb fixture, `core.test.cjs` "bomb costs a heart") for each of the three kinds; shield-absorb test (bomb + shield → hearts unchanged, `g.shield === false`); slow-mo test (same vy crosses the basket band later, round still expires at `ROUND_MS`); seeded cadence test bounding power-up frequency.
- **Acceptance criteria:**
  - New core tests green; the 14 pre-S2 tests plus S2 fixtures unmodified and green; full `npm test` green.
  - `?qa=1` smoke: force each power-up via `__gameTest.game` item injection and confirm score/shield/slow behavior via `getState()`.
  - `npm run test:browser` green (30 checks) with the new HUD chip present.
- **Native impact:** The generated controller's snack-catch render branch must map the 3 new kinds (glyph + color, e.g. `★` + `#ffe66d`); requires a `native/adapter.js` edit + `npm run build-lenses` regen. `itemPool` stays 24 objects. Visual mapping is verified in Studio preview only — not on device (that is S7).
- **Effort:** L

## S4 — Variety & Economy

- **Goal:** Audio/juice economy and honest per-run stats that S5 can build charts from.
- **Files changed:** `games/snack-catch/app.js`, `games/snack-catch/core.js` (one stat), `games/snack-catch/core.test.cjs`.
- **Implementation steps:**
  - Combo pitch-scaled audio: replace the kind-name-length pitch hack in `sfx.catch` (`620 + (k.length % 3) * 80`) with pitch rising by combo count (capped ~15 steps), still a single short `blip()`.
  - Honest best-combo stat: core gains `g.maxMultiplier` (reset in `start()`, updated on each tier-up). Today the recap "Best combo" (`recapCombo`) shows `game.multiplier` at round end, which resets to ×1 on any late miss/bomb — misleading.
  - Per-run stat capture: `endRound()` appends `{date, score, catches, missed, bombsHit, maxMult}` to guarded `localStorage` key `snack-catch-history` (try/catch, capped at ~30 entries). `catches/missed/bombsHit` already exist on core.
  - Mute persistence: already implemented (`loadMuted`/`saveMuted`, key `snack-catch-muted`) — verify only, no rewrite.
  - Document which events drive native juice (`catch` pulse, `bomb` flash) in a comment block consumed by S6; no native code in this slice.
  - New core test: `start()` resets `maxMultiplier`; a run reaching a tier then missing still reports `maxMultiplier ≥ 2` while final `multiplier === 1`.
- **Acceptance criteria:**
  - `node --test games/snack-catch/core.test.cjs` green including the `maxMultiplier` test; full `npm test` green; `node --check app.js` passes.
  - `?qa=1`: play a run with a mid-run miss after a combo tier — recap "Best combo" no longer reads ×1; `__gameTest.getHistory()` (new) returns the appended run record.
- **Native impact:** None directly; `maxMultiplier` flows into native render only when S6 regenerates the controller. Native audio remains absent (`native/README.md` still says "no native audio") until S6.
- **Effort:** S

## S5 — Meta & Retention (browser, local-only)

- **Goal:** Daily challenge seed, last-7-days best history chart, session stats, and mission-style nudges — all from local storage, nothing networked.
- **Files changed:** `games/snack-catch/app.js`, `games/snack-catch/index.html`, `games/snack-catch/style.css`, `games/snack-catch/core.js` (pure seed helper), `games/snack-catch/core.test.cjs`.
- **Implementation steps:**
  - Daily seed: add pure `PocketGame.seedFromString(str)` (ES5 FNV-1a over characters — core stays Date-free per its header contract); `app.js` derives the local `YYYY-MM-DD` string and creates the daily round with `createGame({ rng: mulberry32(seed) })`.
  - Daily completion: `snack-catch-daily` stores `{date, score}`; recap shows a "Daily done" badge the same day (same-seed replays allowed but not re-scored).
  - Last-7-days chart: render best score per day from `snack-catch-history` (S4) as a simple 7-slot bar chart on the recap card (flat palette, no gradients, per `style.css` conventions).
  - Session stats chip: runs today + catches today, sliced from history.
  - Mission nudges: one local mission on the start card, e.g. "Catch 15 in a row", progress from best combo today (S4's `maxMultiplier`/combo data); informational only, never gates play.
  - Tests: `seedFromString` determinism in `core.test.cjs` (same string → same u32; different strings differ). A QA-only `?date=` override in `app.js` makes daily determinism checkable in-browser.
- **Acceptance criteria:**
  - New core test green; full `npm test` and `npm run test:browser` green.
  - `?qa=1&date=2026-09-27` twice → same daily seed and identical item sequence under fixed inputs (assert via `__gameTest.getState()`).
  - Chart renders 7 empty slots with no history; all new localStorage keys documented in `games/snack-catch/README.md`.
- **Native impact:** None. A native daily seed could reuse `seedFromString` via regeneration, but native meta is explicitly out of scope until device verification (S7); native persistent storage currently holds best score only.
- **Effort:** M

## S6 — Native Parity (lens project)

- **Goal:** Make the native scene look and feel like the browser game within verified limits: real item/basket art, native-safe juice, native audio, regenerated controller.
- **Files changed:** `native/adapter.js`, regenerated `games/snack-catch/lens/GameController.js`, `lens-projects/snack-catch-lens/` (Studio-side edits), `native/README.md`, `games/snack-catch/lens/SETUP.md`.
- **Implementation steps:**
  - Asset cleanup (Studio, manual): delete the duplicate "GameController 2.js" asset in `lens-projects/snack-catch-lens` (right-click → Delete in Asset Browser), one of the open items in `docs/SNAPCHAT-HANDOFF.md`; confirm the wired controller is the freshly regenerated one.
  - Replace white placeholder materials: import `assets/native/basket.png` and the five snack/bomb PNGs (ten 128×128 transparent crops exist there per `assets/ART.md`) as textured Screen Images for the basket and the 24-object `itemPool` — or per-object tinted materials per `native/README.md`. Duplicate materials before per-object tinting (handoff checklist item 3). Keep the `●`/`✹` glyph mapping as documented fallback, extended with S3's three new kinds.
  - Native-safe juice: consume the events the controller currently discards (`GameController.js` UpdateEvent calls `game.takeEvents()` and drops the array): basket pulse on `catch`, red flash on `bomb`, combo text pop on `combo`. No camera shake and no ScreenTransform offsets against the touch layer — device behavior is unverified; revisit only after S7.
  - Native audio via Snap audio components: short catch/combo/bomb/over clips consistent with the browser `sfx` design, added as new controller inputs only if needed — any `@input` change means `node scripts/build-lenses.cjs`, full re-wire in Studio, and a preview re-check via the documented MCP flow (`docs/SNAPCHAT-HANDOFF.md` history, `lens-projects/snack-catch-lens/ls-live-instance.json`).
  - Regeneration + re-verification: run `npm run build-lenses`; `node --test tests/native-adapter.test.cjs` (embedded-core equality + drag assertion) green; re-assign every `@input` (`playArea`, `pauseButton`, `scoreText`, `timeText`, `messageText`, `startPanel`, `overPanel`, `pausePanel`, `basket`, `itemPool`, …) against the regenerated `@input` list; re-run preview and confirm no script errors beyond the two benign deprecation warnings.
  - Update the Snack Catch section of `native/README.md` and `SETUP.md` for the new visuals/inputs, keeping the "not validated on device" wording.
- **Acceptance criteria:**
  - Regenerated embedded core is byte-identical to `games/snack-catch/core.js` (`tests/native-adapter.test.cjs` green); `node --check` passes on the generated controller.
  - Studio preview: start → score → bomb → over → retry loop runs with no script errors; duplicate asset gone; no white default materials remain on basket/items.
  - Artifact: preview screen recording saved under `artifacts/` and referenced from `docs/SNAPCHAT-HANDOFF.md`.
- **Native impact:** This is the native slice. All claims stay at "Lens Studio 5.24 preview" level per `docs/SNAPCHAT-HANDOFF.md` — nothing here is device-verified.
- **Effort:** L

## S7 — Device Validation

- **Goal:** Run the real gates — `docs/SNAPCHAT-HANDOFF.md` checklist items 4–6 — on a paired phone. These are exit criteria, not status: until executed, the repo keeps saying device verification NOT done.
- **Files changed:** `docs/SNAPCHAT-HANDOFF.md` (results + dates appended), `native/README.md` (final anchor values), `artifacts/` (recordings, logs). Any code fix that falls out gets its own change + preview re-run.
- **Implementation steps (each with pass criteria and artifact):**
  - Pair phone and boot: game starts from Studio onto Snapchat; full start → play → over → retry loop works. Artifact: screen recording.
  - Safe areas: items/HUD clear Snapchat's top bar and bottom capture UI; if obscured, retune PlayArea anchors from the `±0.90 / ±0.70` starting values (`native/README.md` itself calls them "starting values, not a safe-area guarantee"). Pass: all 24 pool positions + HUD readable on device. Artifact: screenshots + final anchor values recorded in `native/README.md`.
  - Drag vs touch blocking: the controller sets `global.touchSystem.touchBlocking = true` (`OnStartEvent`); verify basket dragging never triggers Snapchat swipe gestures, and capture button + camera switching still work mid-round. Pass: a full 30 s round completable by touch without leaving the lens. Artifact: recording.
  - Capture-button reachability / pause control: pause button at normalized PlayArea (0.82, 0.90), 0.28×0.18 (`native/README.md`) keeps a ≥44 px hit region on device and doesn't sit under thumb-shading. Artifact: photo + note.
  - Resize/aspect QA: at least two phone aspect ratios (e.g. iPhone tall + Android 20:9); the controller's anchor math (`rect()`: `x/180 - 1`, `1 - y/320`) keeps basket and pool aligned edge-to-edge. Pass: no clipped items, basket reaches both safe-area edges. Artifact: recordings.
  - Performance: worst case is the 24-item pool late-round (post-S2, `FALL_MAX`-capped). Pass: no visible stutter across a full 30 s round; 3 consecutive rounds without thermal throttling. Artifact: perf/Logger notes.
  - Storage, audio, accessibility on device: `persistentStorageSystem` best survives lens restart; audio audible (if S6 landed) with a working mute path; bombs distinguishable by shape, not color alone. Artifact: device notes appended to checklist item 6.
- **Acceptance criteria (exit):** every item above executed on hardware and recorded in `docs/SNAPCHAT-HANDOFF.md` checklist items 4–6 with dates + artifacts; any anchor/material/code fallout re-run through preview and noted.
- **Native impact:** All of it. No browser work in this slice.
- **Effort:** L

## S8 — Submission-Ready

- **Goal:** Packaging, submission assets, final QA ladder and version tag. The submission itself is the user's manual step via their own Snap account (handoff checklist item 8); approval timing is Snap's.
- **Files changed:** new 1024px icon asset (from the `assets/` art pack conventions in `assets/ART.md`), `docs/SNAPCHAT-HANDOFF.md`, `games/snack-catch/core.js` (version bump only), `games/snack-catch/README.md`.
- **Implementation steps:**
  - Lens icon: original 1024×1024 PNG derived from the basket/sprite art — no Snap trademarks, and per `assets/ART.md` raster hero art is illustration, not a gameplay screenshot; check legibility at 96 px.
  - Preview video: 10–20 s vertical 9:16 shot list — 0–2 s title + basket idle; 2–7 s drag, catches, combo popup; 7–10 s bomb hit + heart loss; 10–14 s power-up (shield/slow-mo); 14–18 s recap + "Play Again". Record from device (S7 artifact) where possible.
  - Snapcode: export from Lens Studio / My Lenses after Studio validation; store the PNG under `artifacts/` and record links in `docs/SNAPCHAT-HANDOFF.md` only once real (checklist item 9 — no fabricated links; share the website as browser preview until approval).
  - Final full QA ladder: `npm ci` → `npm test` → `npm run build` → `npm run test:browser` (exact scripts in `package.json`), plus `npm run build:lenses` and `tests/native-adapter.test.cjs`; all exit 0 with output recorded.
  - Version tag: bump core `VERSION` (currently `'1.0.0'`; the UMD-shape test already asserts it is a string) to match the release, note it in `games/snack-catch/README.md` and `docs/SNAPCHAT-HANDOFF.md`. Git tagging/commits are the parent's job, not this slice's.
- **Acceptance criteria:** QA ladder commands all recorded green; icon file present at its documented path at 1024×1024; video ≤ 20 s at 9:16; `docs/SNAPCHAT-HANDOFF.md` items 8–9 updated with real artifacts or explicitly left pending with a dated note; zero claims of publication.
- **Native impact:** Submission assets only; still no approval claims.
- **Effort:** S
