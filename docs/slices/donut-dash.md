# Donut Dash — 8-slice update plan (2026-09-27)

Status today: the fourth game joined the collection via commit `2b4626a`
(shipped from a concurrent session, pulled into this canonical copy
2026-09-27). Browser game complete: tap-to-jump + one mid-air double jump,
world scrolls right with player x fixed at 90 (`PLAYER_X`), speed ramps
`SPEED_BASE 240 → SPEED_MAX 520` at `SPEED_GAIN 6`/s, 3 hearts with
`IFRAMES 1.2` mercy invulnerability, 4 crate shapes with a tested gap-safety
invariant, snack pickups (`PICKUP_PTS 25`), distance score (`SCORE_PER_PX
1/12`), 19 core tests, standard browser contracts (`#btnStart` family, guarded
localStorage, procedural audio, `?qa=1` QA hook), and the shared native
adapter gained a `donut-dash` branch (tap = `game.jump()`, player rendered via
`basket`, obstacles via `itemPool`). Landing page shows 4 cards. NOT done:
native lens scene (`lens-projects/donut-dash-lens/` does not exist yet), any
device verification, submission packaging.

| Slice | Name | One-line goal | Effort |
|---|---|---|---|
| S1 | Feel & Juice | Jump squash/land dust, double-jump flip, crash shake + i-frame blink, pickup sparkles | M |
| S2 | Fairness & Difficulty | Speed-ramp reaction-window audit, "no impossible sandwich" crate fixtures, humane cap | M |
| S3 | Feature: Snack Trails & Combo | Reachable snack arcs in jump paths + chain multiplier on clean collection | M |
| S4 | Variety & Economy | Golden donut, shield, magnet; spring crate bounce; weights + tests | M |
| S5 | Meta & Retention | Best-distance ghost flag, 7-day chart, daily seed, missions — local-only | M |
| S6 | Native Parity | Assemble `lens-projects/donut-dash-lens/` via MCP with the shared adapter branch, preview clean | L |
| S7 | Device Validation | Tap-to-jump vs Snapchat touch blocking, double-jump at touch latency, safe areas, speed legibility | L |
| S8 | Submission-Ready | Icon, preview video shot list, Snapcode, final QA ladder, version tag | S |

---

## S1 — Feel & Juice (M)

**Goal:** make the runner tactile without touching rules.

**Files changed:** `games/donut-dash/app.js` (render/events only).

**Implementation steps**
1. Jump stretch + landing dust puff on the donut; slight rotation anticipation
   on jump windup (none — jump is instant; use squash on land only).
2. Double-jump visual flip/spark so the second jump reads distinctly.
3. Crash: screen shake + red edge flash; i-frame blink already exists — make
   the blink gentler and add heartbeat audio under 1 heart.
4. Pickup sparkles tiered by combo position (S3 lands the combo; this slice
   renders sparkle variants).

**Acceptance:** all motion gated behind the existing `prefers-reduced-motion`
check; `npm test` and browser suite green; screenshots at 390×844 reviewed.

**Native impact:** none (render-only).

## S2 — Fairness & Difficulty (M)

**Goal:** prove the ramp stays humane and crates never generate impossible walls.

**Files changed:** `games/donut-dash/core.js`, `core.test.cjs`.

**Implementation steps**
1. Reaction-window table from real constants: at speed v, a crate group is
   readable for `(spawnX − PLAYER_X)/v` seconds — report at 30s intervals of
   play as v goes 240→520; add a fixture locking the readable window at
   ≥ 450 ms through the first 60s.
2. "No impossible sandwich" fixture: after any tall (38×78) or double crate,
   the next group must leave ≥ the tested jump-clearance distance (extend the
   existing gap-safety invariant).
3. Validate `SPEED_MAX 520` against double-jump horizontal air time (jump apex
   ~132px each) — if clearing a wide crate at max speed requires frame-perfect
   input, lower `SPEED_MAX` to 480 and lock it with a test.
4. Mercy tuning: i-frame refresh on second crate contact within one group.

**Acceptance:** new deterministic fixtures green; `node scripts/build-lenses.cjs`
regenerated (core changed) and `tests/native-adapter.test.cjs` stays green.

**Native impact:** controller regeneration only.

## S3 — Feature: Snack Trails & Combo (M)

**Goal:** reward clean runs with arc-shaped snack trails and a chain multiplier.

**Files changed:** `games/donut-dash/core.js`, `core.test.cjs`, `app.js`.

**Implementation steps**
1. Snack trails spawn along real jump arcs (deterministic: placed at sampled
   parabola points of a seeded jump) — fixture asserts every trail point is
   reachable (within jump envelope at current speed).
2. Combo: consecutive pickups without a crash → x2 after 5, x3 after 10
   (`PICKUP_PTS 25` × multiplier); crash resets chain. Multiplier shown in HUD.
3. Recap gains "best chain" + "snacks collected".

**Acceptance:** fixtures for multiplier tier edges + trail reachability;
`npm test` green.

**Native impact:** regeneration; HUD multiplier maps to existing `timeText`
pattern (no new `@input`).

## S4 — Variety & Economy (M)

**Goal:** variety beyond crates and plain snacks.

**Files changed:** `games/donut-dash/core.js`, `core.test.cjs`, `app.js`.

**Implementation steps**
1. Golden donut (rare, 3x points, slightly higher arc placement).
2. Shield pickup (one free crash — consumed instead of a heart, no i-frame
   change); HUD shield chip.
3. Magnet (5s: pickups within 80px pull to the player).
4. Spring crate (bounces the player up on top-hit instead of crashing — top
   collision only; side hit still crashes).
5. Spawn weights deterministic via injected rng; nothing new in the first
   520 world-px (`FIRST_OBST_AT` unchanged).

**Acceptance:** per-type fixtures + weight determinism test; QA-hook browser
smoke; `npm test` green; regenerate lens controllers.

**Native impact:** regeneration; shield chip renders via existing texts.

## S5 — Meta & Retention (M)

**Goal:** local-only comeback hooks.

**Files changed:** `games/donut-dash/app.js`, `index.html` (recap block).

**Implementation steps**
1. Best-distance ghost: a flag marker at the personal-best distance rendered
   in-world during runs (guarded localStorage).
2. Recap delta ("+120m over best"), last-7-days best chart (inline SVG).
3. Daily seeded run (date string → seed passed from app; core stays Date-free).
4. Missions: "reach 300m without crashing", "collect 15 snacks in one chain".

**Acceptance:** unit fixtures for seed derivation + ring buffer; browser
check for persistence across reload (siblings' pattern).

**Native impact:** none.

## S6 — Native Parity (L)

**Goal:** the missing native scene — `lens-projects/donut-dash-lens/` —
assembled and preview-clean, same bar as the other three.

**Files changed:** new `lens-projects/donut-dash-lens/`; `native/README.md`
(game-specific section, if the shared adapter branch needs documenting);
`docs/SNAPCHAT-HANDOFF.md` status.

**Implementation steps**
1. MCP scene assembly with the documented recipe (GameCamera/GameCanvas/
   PlayArea ±0.90/±0.70, Score/Time/Message texts, PauseButton, panels).
   The shared `native/adapter.js` already has the `donut-dash` branch:
   player = `basket` object, obstacles = `itemPool`, tap = jump.
2. Import `games/donut-dash/lens/GameController.js` (generated — confirm its
   `GAME_ID` is `donut-dash`), wire every `@input` incl. `itemPool[24]`.
3. Tint materials: golden donut player, crate grays/browns — avoid shipping
   white placeholders (the lesson from the first three).
4. Save to the repo path; `RunAndCollectLogsTool` refresh → no script errors.

**Acceptance:** scene assembled + wired + preview-clean, recorded honestly in
the handoff status section.

**Native impact:** this slice is the native bring-up.

## S7 — Device Validation (L)

**Goal:** the runner's real gates on Snapchat hardware.

**Implementation steps / gates (exit criteria, NOT claims)**
1. Tap-anywhere-to-jump does not conflict with Snapchat's touch blocking or
   trigger capture UI; double-jump registerable at real touch latency (the
   S2 reaction-window numbers re-measured on device).
2. Speed legibility: crates readable at `SPEED_MAX` on a phone screen at arm's
   length; PlayArea ±0.90/±0.70 anchors tuned against real chrome.
3. Performance with full `itemPool` at max speed; interruptions pause/resume
   cleanly; persistent best survives restart.
4. Results recorded in `docs/SNAPCHAT-HANDOFF.md` per checklist items 4–6;
   failures loop back to S6 fixes.

**Acceptance:** every gate recorded pass/fail with artifact.

## S8 — Submission-Ready (S)

**Goal:** Snapcode-ready package for the fourth shipped concept.

**Implementation steps**
1. Original 1024px icon (donut mid-jump over crate, family style).
2. 10-20s vertical preview video shot list: first jump → double-jump save →
   snack trail chain → near-miss at speed → crash → recap; captured from
   Studio preview.
3. Snapcode + link recorded post-approval; final QA ladder
   `npm ci → npm test → npm run build → npm run test:browser`; version tag.
4. Submission is the user's manual step via their Snap account.
