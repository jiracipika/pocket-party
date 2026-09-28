# Stack Rush — 8-slice update plan (2026-09-27)

**Status today.** The browser game in `games/stack-rush/` (`core.js` deterministic ES5 UMD core, `app.js` canvas renderer, `index.html`, `style.css`) is complete and tested — 66 unit + 30 browser checks green repo-wide as of 2026-09-26. Tap/Space drops the sliding block (`OVERLAP_TOL = 4` logical px snaps perfect drops to the previous x and awards `score += 1 + streak`), overlap trims width with falling debris (`MIN_W = 12` ends the run on a too-thin landing, zero overlap ends it immediately), speed ramps from `BASE_SPEED = 120` by `SPEED_GAIN = 8` per layer to `MAX_SPEED = 340`. The 2026-09-26 pass added the full-bleed tall-phone layout (`app.js` `resize()` computes `viewH >= 640`, tower anchored to the bottom) and the "TAP TO DROP THE BLOCK" first-run hint (`HINT_SHOW = 3.5`, fades on first drop, honours `prefers-reduced-motion`). The first block slides on the bare ground — there is no pre-placed base layer (`layers: 0` at start, the first drop becomes layer 1) — and the game is score-attack endless. Audio is procedural WebAudio; particles/debris visuals are browser-only; `window.__gameTest` exists under `?qa=1`. Native: `lens-projects/stack-rush-lens/` (real `.esproj`) was assembled via MCP per `docs/SNAPCHAT-HANDOFF.md` — GameCamera/GameCanvas, PlayArea at ±0.90/±0.70 anchors, Score/Time/Message texts, panels, MovingBlock + 24 LayerPool Screen Images wired to the generated `games/stack-rush/lens/GameController.js`; preview runs with no script errors. Still open there: duplicate `GameController N.js` asset cleanup, all blocks still default WHITE (materials/tints unset), and zero device verification. Nothing native or on-device may be claimed done.

| Slice | Name | One-line goal | Effort |
|---|---|---|---|
| S1 | Feel & juice | Landing squash, dust, perfect flash + micro-shake, eased camera rise, and fix the tall-phone cull bug | M |
| S2 | Fairness & difficulty | Measure the real reaction window per layer, guarantee a humane opening, alternate spawn sides | M |
| S3 | Streak economy | Perfect-streak multiplier (x2 at 3, x3 at 6) + high-drop risk/reward bonus, with recap stats | M |
| S4 | Variety & economy | Best-score unlockable block palettes with start-panel preview, persisted locally | S |
| S5 | Meta & retention | Best-run ghost silhouette, 7-day best chart, session stats, upgraded share text | M |
| S6 | Native parity | White→tinted per-layer materials (headline), landing flash, native audio, asset cleanup | M |
| S7 | Device validation | Real phone gates: readability, Snapchat UI overlap, safe-area anchors, pool perf, interruptions | L |
| S8 | Submission-ready | Icon, preview video, Snapcode, docs links, final QA ladder, version tag | S |

---

## S1 — FEEL & JUICE (browser)

**Goal.** Make every drop land with weight: landing squash on the placed layer, dust puff, perfect-drop flash ring + screen micro-shake, and camera easing as the tower rises — all render-only, no core rule changes.

**Files changed.**
- `games/stack-rush/app.js` (all juice; also fixes the cull bug below)
- `games/stack-rush/index.html`, `games/stack-rush/style.css` (only if a recap/help line mentions effects)

**Implementation steps.**
1. Fix the tall-phone cull bug first: `app.js` `draw()` skips settled layers with `if (sy0 > LOGICAL_H + 40 || sy0 + l.h < -40) continue;` — on a 390×844 phone `viewH ≈ 779`, so bottom layers whose logical screen y exceeds 680 are culled and the base of the tower is invisible. Change the lower bound to `viewH + 40` (keep `LOGICAL_H` only if a separate letterbox decision demands it). Verify base layer renders on a tall viewport via `__gameTest.getState()` + canvas sample.
2. Landing squash: on `lastEvent.type === 'drop' | 'perfect'`, animate the top placed layer with a 90–140 ms scaleY dip (0.85 → 1) around its bottom edge in `drawBlock`, driven by a `squashT` timer keyed to layer index; skipped entirely when `reducedMotion`.
3. Dust puff: reuse the existing `burst()` particle system with a grey/low-alpha palette and sideways velocities at the layer's bottom corners on every landing (distinct from the current hue burst used for perfects).
4. Perfect feedback: expanding stroke ring (radius 0→~40 logical px, alpha 1→0, ~250 ms) centered on the placed layer plus a 2–3 px canvas translate micro-shake for ~120 ms (offset via `Math.sin`, amplitude ≤ 3 px); both suppressed under `prefers-reduced-motion` (ring may remain as a static pulse-less highlight, shake removed).
5. Camera easing: core `panCamera()` snaps `cameraY` instantly each drop (and `CAMERA_DEADZONE = 80` in `core.js` is declared but never read). Add a displayed-camera lerp in `app.js`'s `frame()` (`camDisplay += (s.cameraY - camDisplay) * min(1, dt * 8)`) and draw with `camDisplay`; with reduced motion snap directly. Do not touch core rules; note `CAMERA_DEADZONE` for deletion in S2.

**Acceptance criteria.**
- `node --test games/stack-rush/core.test.cjs` (16 tests) and `npm run test:browser` (30 checks) stay green; no core.js diff in this slice.
- New browser check via `?qa=1`: start, drop twice, assert `getState().layers.length === 2` — drive a tall viewport (e.g. 390×844), compute `layerScreen(0)` from `__gameTest.getState()`, and assert its logical screen y sits inside `[0, viewH]` (i.e. the pre-fix cull predicate `sy0 > LOGICAL_H + 40` would have rejected it); confirm via screenshot that the base layer is visible.
- Manual/Playwright: perfect drop shows a ring that completes within ~300 ms; `prefers-reduced-motion: reduce` emulation yields no shake and no squash (ring allowed as a static highlight); camera visibly eases over ≥ 3 layers instead of jumping.

**Native impact.** None. Pure browser renderer; no `@input` changes, no regeneration of `games/stack-rush/lens/GameController.js`.

**Effort.** M

---

## S2 — FAIRNESS & DIFFICULTY (core)

**Goal.** Replace "feels fast" with a measured reaction window, protect the opening blocks, and stop same-edge spawn streaks.

**Files changed.**
- `games/stack-rush/core.js` (constants + `spawnBlock`)
- `games/stack-rush/core.test.cjs` (new deterministic fixtures)
- `games/stack-rush/lens/GameController.js` (regenerated via `node scripts/build-lenses.cjs` — embeds core verbatim; `tests/native-adapter.test.cjs` enforces exact source equality)

**The measured problem (from actual constants).** Block for layer *n* moves at `min(MAX_SPEED, BASE_SPEED + SPEED_GAIN·(n−1))` = `min(340, 120 + 8(n−1))`. Time inside the ±8 px alignment window (16 px of travel) and inside the perfect window (`OVERLAP_TOL = 4`, 8 px of travel):

| Layer n | Speed (px/s) | ±8 px window | ±4 px (perfect) window |
|---|---|---|---|
| 1 | 120 | 133 ms | 67 ms |
| 5 | 152 | 105 ms | 53 ms |
| 10 | 192 | 83 ms | 42 ms |
| 20 | 272 | 59 ms | 29 ms |
| 35 | 340 (capped from layer 29) | 47 ms | 24 ms |
| 50 | 340 | 47 ms | 24 ms |

The perfect window bottoms out at ~24 ms — timing, not reaction. Also, `spawnBlock()` picks the edge by previous-block position only (`x = prev.x < (width - w) / 2 ? width - w : 0`), so once a tower drifts into one half, every block spawns from the same edge with the same approach direction.

**Implementation steps.**
1. Add a window helper to the test file: `windowMs(n, halfspan)` computing `2·halfspan / min(MAX_SPEED, BASE_SPEED + SPEED_GAIN·(n−1)) · 1000`, and a fixture that logs/asserts the table above for layers 1/5/10/20/35/50 so future constant changes are visible in review.
2. Humane opening: assert `windowMs(n, 8) ≥ 110` for n = 1..3 (holds today at 133/125/118 ms — the test locks it; if a base-speed retune is chosen, keep this floor).
3. Speed cap policy: lower `MAX_SPEED` 340 → 300 (±8 px floor 47 → 53 ms) as the default tune, asserting `windowMs(50, 8) ≥ 50`. Keep the existing 'speed rises per layer and is capped' test passing; update its cap reference via `PG.constants.MAX_SPEED`.
4. Alternate spawn sides: track `lastSpawnSide` in state; `spawnBlock()` flips it each spawn (first block keeps rng side), spawn x still clamped inside the field and never aligned with `prev.x` (preserve the anti-exploit invariant — assert `|spawn.x − prev.x| > OVERLAP_TOL` at spawn for a known seed).
5. Delete the dead `CAMERA_DEADZONE` constant (never referenced; grep-verified) and re-export nothing new.

**Acceptance criteria.**
- New named tests green in `games/stack-rush/core.test.cjs` (the existing 16 must stay green, with the cap test updated to the new `MAX_SPEED`):
  - "reaction window table for layers 1/5/10/20/35/50" — asserts the exact table above within 1 ms tolerance so constant drift is caught in review;
  - "first 3 blocks keep a humane window (≥110 ms)";
  - "spawn sides alternate deterministically" — with `fixedRng()` (always right side today), consecutive `moving.x` values alternate between the two edges across 8 spawns;
  - "spawn never starts aligned (anti-tap-exploit invariant)" — for seeds 1..50, `|moving.x − prev.x| > OVERLAP_TOL` at spawn (this is the regression test for the spawn-aligned tap exploit fixed in the 2026-09 repair pass, see `docs/repair-stack-rush.md`).
- Full repo suites green: `npm test` (includes `games/*/core.test.cjs` and `tests/native-adapter.test.cjs`) — the adapter equality test forces regeneration; run `node scripts/build-lenses.cjs` and confirm it passes.
- `grep -r CAMERA_DEADZONE games/` returns nothing after the constant deletion.

**Native impact.** Core embed changes only; regenerate `lens/GameController.js`, re-assign nothing (inputs unchanged), re-run Lens Studio preview once to confirm no script errors. No device claims.

**Effort.** M

---

## S3 — STREAK ECONOMY (core + browser)

**Goal.** Reward sustained precision with a streak multiplier and add a risk/reward "high drop" for late drops from the far edge.

**Files changed.**
- `games/stack-rush/core.js` (scoring + new state fields + `lastEvent` payloads)
- `games/stack-rush/core.test.cjs` (multiplier and high-drop tests)
- `games/stack-rush/app.js`, `games/stack-rush/index.html` (HUD multiplier badge + recap rows)

**Implementation steps.**
1. Multiplier: `mult(streak) = streak >= 6 ? 3 : streak >= 3 ? 2 : 1`. Perfect drop scores `1 (layer) + streak × mult(streak)` (replaces today's flat `score += 1 + state.streak`). Expose `state.multiplier` so renderers don't recompute it.
2. High drop: on a successful non-perfect landing where the block overshot the previous layer's far edge by ≥ 24 logical px at drop time (`m.x + m.w − (prev.x + prev.w) ≥ 24`) and `newW >= MIN_W`, add a flat +3 and set `lastEvent = { type: 'drop', highDrop: true, ... }`. Mutually exclusive with perfect (perfect snaps `ov` and cannot overshoot). Count `state.highDrops`.
3. HUD: show "×2"/"×3" next to the existing `PERFECT xN` combo chip in `app.js` `refreshHud()`; flash "HIGH DROP +3" via the same hint-text path for ~600 ms.
4. Recap: add rows "Best multiplier" and "High drops" to the `#screen-over` recap card (`index.html` + `showOver()` in `app.js`), fed from `state.bestStreak`-derived multiplier and `state.highDrops`.
5. Keep S2's fairness floors intact — multiplier changes scoring only, not speed or spawn.

**Acceptance criteria.**
- New tests in `core.test.cjs`: "multiplier tiers: streak 2 → x1, 3 → x2, 5 → x2, 6 → x3" (drive exact scores via `moving.x = base.x` perfect drops and assert `score` totals), "non-perfect drop resets multiplier to 1", "high drop awards +3 and flags lastEvent.highDrop", "high drop impossible on perfect", "highDrops counted across a run", "restart clears multiplier/highDrops".
- `npm test` and `npm run test:browser` green; browser check confirms the ×N badge appears at streak 3 via `__gameTest`.

**Native impact.** Core embed changes → regenerate `games/stack-rush/lens/GameController.js` via `node scripts/build-lenses.cjs` and re-verify Lens Studio preview (no input changes needed; the native `render()` already prints `combo s.streak` and can later show the multiplier from `s.multiplier` — optional line in S6).

**Effort.** M

---

## S4 — VARIETY & ECONOMY (browser)

**Goal.** Unlockable block palettes tied to best-score milestones (10/25/50/100), persisted locally, previewed on the start panel. No core changes.

**Files changed.**
- `games/stack-rush/app.js` (palette table, unlock check, hue override at draw time)
- `games/stack-rush/index.html`, `games/stack-rush/style.css` (swatch strip on `#screen-start`)

**Implementation steps.**
1. Define 5 palettes as hue-ramp descriptors in `app.js`: default neon (today's ramp `(layerIndex · 14 + 40) % 360`), plus e.g. Sunset (gold→coral, matching the native README ramp), Mint, Violet, Ember. Locked at best ≥ 10/25/50/100 respectively.
2. Apply at render time only: `draw()` maps each layer's hue through the active palette (layer index → palette hue); `core.js` keeps emitting its own hue untouched. Moving block uses the next layer index so the ramp is continuous.
3. Persistence: `localStorage` keys `stack-rush-palette` (selection) and unlock derivation from the existing `BEST_KEY = 'stack-rush-best'` (guarded `store` wrapper already handles private-mode); no new storage schema beyond the selection key.
4. Start-panel preview: a swatch row under `.best-line` in `#screen-start` — unlocked palettes clickable (selection persists), locked ones dimmed with their milestone label ("BEST 25"). Tapping an unlocked swatch re-renders a 3-block preview strip in that ramp.
5. Selected palette also tints the perfect flash ring / particles from S1 for coherence.

**Acceptance criteria.**
- `npm run test:browser` green; `node --test games/stack-rush/core.test.cjs` untouched and green (proves "no core changes").
- QA checks via `?qa=1`: seed `localStorage['stack-rush-best'] = 25`, reload, assert exactly the 10/25 palettes enabled in the DOM swatch row; select one, assert `localStorage['stack-rush-palette']` set and the drawn block hue for layer 0 matches the palette's first hue (read back via a debug hook or computed style of the preview strip).

**Native impact.** None (browser-only cosmetics; native materials are handled in S6).

**Effort.** S

---

## S5 — META & RETENTION (browser, local-only)

**Goal.** Give runs a memory: best-run ghost on game over, last-7-days best history, session stats, and a share text that carries layers + perfects.

**Files changed.**
- `games/stack-rush/app.js` (ghost capture/render, history store, session stats, share text)
- `games/stack-rush/index.html`, `games/stack-rush/style.css` (history chart + session rows on `#screen-over`)

**Implementation steps.**
1. Ghost: when a new best is set in `showOver()`, persist the final silhouette as `[x, w]` per layer (JSON, key `stack-rush-ghost`, capped at 60 layers). On subsequent game overs, draw the best tower as a dashed outline behind the current final tower in `draw()` (phase `'over'` only), so players see how close they got.
2. History: daily bests in `stack-rush-history` (`{"2026-09-27": 34, ...}`); render a compact 7-bar chart (CSS bars, no canvas) on the recap panel with the best value labelled.
3. Session stats: per-visit counters (runs, layers, perfects, best this session) shown as a single line under the recap card; reset on reload, never persisted as a fake leaderboard.
4. Share text: extend `shareScore()` from "I scored X points (Y layers)" to include perfects and best streak: `"... X points — Y layers, Z perfect drops, best streak S in Stack Rush!"` — keep `navigator.share` → clipboard → text fallback chain unchanged.
5. All storage goes through the existing guarded `store` wrapper; failures degrade silently to "no ghost/chart".

**Acceptance criteria.**
- `npm run test:browser` green after each sub-feature; `core.test.cjs` untouched and green.
- QA: play a run to ≥ 3 layers with `?qa=1`, force a miss, assert `localStorage['stack-rush-ghost']` parses to an array of length `layers.length`; seed `stack-rush-history` with 3 days and assert the chart renders 7 slots (3 filled); assert share text contains the layer and perfect counts (capture the fallback-text path by stubbing `navigator.share` absent).

**Native impact.** None. Native has its own local best via `persistentStorageSystem` ('pocket-party-stack-rush-best' key in `GameController.js`) — ghost/history are explicitly browser-only this slice; a native equivalent would be a future, separately-verified feature.

**Effort.** M

---

## S6 — NATIVE PARITY (lens project)

**Goal.** Make the native scene look like the game: replace default white blocks with the warm ramp (headline), add a simple landing flash and native audio, and clear the known asset debt.

**Files changed.**
- `lens-projects/stack-rush-lens/` (Studio scene: materials, tints, audio components, duplicate asset deletion — via the documented MCP flow)
- `games/stack-rush/lens/GameController.js` (only if regenerated; `node scripts/build-lenses.cjs` after any core change from S2/S3)
- `docs/SNAPCHAT-HANDOFF.md` (status section update: what changed, what remains unverified)

**Implementation steps.**
1. Headline — white→tinted: per `native/README.md` ("LayerPool: use warm gold/coral materials"; checklist item 3 "duplicate materials if setting per-object colors"), create 24 duplicated materials for the LayerPool slots tinted along the browser ramp `(k · 14 + 40) % 360` for slot k (warm gold ≈ hue 40 → coral ≈ hue 14 after wrap; pick fixed HSL→RGB values in Studio), plus one tinted material for `movingBlock`. Scene-side only — no `@input` changes, no regeneration required for this step.
2. Optional controller line (regeneration required): set `timeText` to include the multiplier (`'N layers • combo S • ×M'`) now that the core exposes it (S3).
3. Landing flash: in `render()`, read `state().lastEvent` (the `events()` queue is consumed-and-discarded each tick; `lastEvent` persists) and flash the top placed pool slot white for ~120 ms on `perfect` (scale or overlay), per the repo rule that native rendering omits particles/debris — document the simplification in `games/stack-rush/lens/SETUP.md`.
4. Native audio: add one short AudioTrackAsset per cue (drop/perfect/miss), play via an AudioComponent on the controller scene object; if a new `@input` is needed (e.g. `sfxTrack`), regenerate with `node scripts/build-lenses.cjs`, re-wire the new input in Studio, and re-verify preview per `docs/SNAPCHAT-HANDOFF.md`.
5. Cleanup: delete the duplicate `GameController N.js` asset (right-click → Delete in Asset Browser) and confirm the assigned controller is the freshly generated one; `tests/native-adapter.test.cjs` stays green.
6. Update `docs/SNAPCHAT-HANDOFF.md` status section: tints + flash + audio done in preview, duplicate asset removed — device verification still NOT done.

**Acceptance criteria.**
- `npm test` green including `tests/native-adapter.test.cjs` (exact core-embed equality) after any regeneration.
- Lens Studio preview (5.24): no script errors in Logger; tower layers visibly tinted along the ramp (no white blocks); landing flash fires on drop/perfect; audio plays once per cue; mute behavior matches `docs/SNAPCHAT-HANDOFF.md` checklist item 6 expectations (still device-unverified).
- No claim of device validation anywhere in the diff or docs.

**Native impact.** This slice is native; it must not touch browser rules (core changes ride in from S2/S3 and are test-covered there).

**Effort.** M

---

## S7 — DEVICE VALIDATION (real gates)

**Goal.** Run the actual device gates from `docs/SNAPCHAT-HANDOFF.md` checklist items 4–6 on a paired phone. Nothing here is "done" until observed on hardware.

**Files changed.**
- `docs/SNAPCHAT-HANDOFF.md` (checklist results + measured safe-area values)
- `lens-projects/stack-rush-lens/` (only for anchor/size tunings discovered)

**Implementation steps.**
1. Pair a phone running Snapchat to the Lens Studio preview (Snapchat → paired device), open the lens, confirm touch flow end-to-end: start, drop, perfect, miss, game over, retry, pause/resume with the pause control at (0.82, 0.90) normalized PlayArea units.
2. Tower readability at height: build to 20+ layers on the narrowest test phone; verify thin layers (`MIN_W = 12` logical px ≈ small screen fraction) remain distinguishable and the top layer + moving block stay readable against the sky region.
3. Tap zones vs Snapchat UI: verify the capture button, chat headers, and profile strip do not steal touches meant for PlayArea (`touchBlocking` is set in `OnStartEvent`), and that no gameplay element sits under them; record any conflict.
4. Safe-area anchors: evaluate PlayArea ±0.90 / ±0.70 against the real Snapchat chrome; adjust and record final anchor values (README explicitly calls these "starting values, not a safe-area guarantee").
5. Performance: run a 24-layer tower with the full pool enabled; watch frame rate/resolution scaling during sustained play and during debris-free misses (native omits particles — confirm no hidden cost regressions anyway).
6. Interruptions: trigger a notification, an incoming call, and a camera switch mid-run; `OnDisableEvent` pauses the game — verify the pause panel shows and the run resumes without a phantom drop, and that `persistentStorageSystem` best survives restart.

**Acceptance criteria.** Each step gets a written pass/fail line in `docs/SNAPCHAT-HANDOFF.md` with device model + OS + Snapchat version:
1. Touch flow: every phase transition reachable by tap on device; pause control hit region ≥ 44 px effective.
2. Readability: layers at `MIN_W = 12` logical px still resolvable at 20+ layers on a ~360 dp-wide phone; screenshot attached to the doc.
3. Tap zones: 20 rapid taps across the full PlayArea — zero captured by Snapchat chrome, zero phantom drops while a system sheet is open.
4. Safe area: final PlayArea anchors recorded (e.g. "±0.90/±0.70 kept" or the tuned values) with a note of what overlapped if changed.
5. Performance: sustained play session ≥ 2 min at 20+ layers with no visible frame stalls; note the Studio stats readout.
6. Interruptions: notification, incoming call, and camera switch each leave the run paused with the pause panel showing; resume never consumes a queued drop; best score persists across app relaunch.
Pass = all six observed correct on device; any fail becomes a concrete tuning item back into S6. Status remains "device verification performed on <device>, not publication approval".

**Native impact.** Device-only; no browser code changes expected.

**Effort.** L (hardware + coordination dependent)

---

## S8 — SUBMISSION-READY

**Goal.** Package the lens for the user's manual submission: icon, preview video, Snapcode, docs, final QA, version tag.

**Files changed.**
- `lens-projects/stack-rush-lens/` (icon asset, preview video, lens name/metadata in Studio)
- `docs/SNAPCHAT-HANDOFF.md` (submission section: links, Snapcode, shot list)
- root `README.md` / `index.html` (only to link the Snapcode when it exists — no fabricated links)

**Implementation steps.**
1. Original 1024×1024 lens icon (tower motif on the `#0a0a0f` background with the `#ffe66d` accent, readable at 64 px), set as the lens icon in Studio; verify it renders in the preview carousel.
2. 10–20 s vertical (9:16) preview video shot list: (a) 0–3 s first drop on the ground block with the hint visible; (b) 3–8 s perfect-streak sequence with flash ring/×N badge and the tinted ramp climbing; (c) 8–12 s high tower with camera easing; (d) 12–15 s a miss and tower-down recap; (e) 15–18 s retry tap. Record on the paired phone (post-S7), not the Studio preview, if quality allows.
3. Snapcode: after Snap-side approval workflow begins, download the Snapcode from My Lenses and store it under `assets/` + link it in `docs/SNAPCHAT-HANDOFF.md`; until approval, share only the browser preview (existing rule).
4. Final QA ladder from a clean checkout: `npm ci` → `npm test` → `npm run build` → `npm run test:browser` — all green, with counts recorded in the handoff doc.
5. Tag the version (parent handles git commits/tags per repo rules) and record the tag next to the Snapcode entry.

**Acceptance criteria.** QA ladder output pasted into `docs/SNAPCHAT-HANDOFF.md`; icon + video present in the lens project; docs contain the shot list and (post-approval) real Snapcode URL. Submission itself is explicitly the user's manual step via their own Snap account — the repo never performs or claims it.

**Native impact.** Submission packaging only.

**Effort.** S

---

## Known risks carried into the slices

- **Tall-phone cull bug (S1):** `app.js` `draw()` culls layers at `sy0 > LOGICAL_H + 40` while the visible band on tall phones is `viewH` (up to ~779 on 390×844) — the bottom of the tower can be invisible on exactly the devices this game targets.
- **Speed ramp tail (S2):** the perfect window shrinks to ~24 ms from layer 29 onward (`MAX_SPEED = 340`); the cap is real but possibly inhumane — the table fixture makes the tradeoff explicit instead of guessing.
- **Spawn-side lock (S2):** spawn edge is derived from previous-block position, not alternation, so a drifting tower produces same-edge streaks and monotone approach directions.
- **Dead constant:** `CAMERA_DEADZONE = 80` in `core.js` is unreferenced; `panCamera()` snaps instantly (S1 eases in the renderer, S2 deletes the constant).
- **Native controller inputs are a shared 3-game template** (`basket`, `itemPool`, `targetText`, `choiceTransforms`, … are unused by stack-rush) — keep stack-rush slices from adding inputs casually; every `@input` change forces regeneration + re-wiring + preview re-verification per `docs/SNAPCHAT-HANDOFF.md`.
