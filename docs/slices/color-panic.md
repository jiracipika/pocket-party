# Color Panic — 8-slice update plan (2026-09-27)

**Status today (honest).** The browser game is complete and tested: `games/color-panic/core.js` is a pure ES5 UMD core (19 tests in `core.test.cjs`, 4 in `roundtimer.test.cjs`), `app.js`/`index.html`/`style.css` render it (11 real-browser checks in `browser-round.test.cjs`; repo-wide 66 unit + 30 browser green). Shipped rules: 30s round (`ROUND_TIME = 30`), 3 hearts (`START_HEARTS = 3`), Stroop token with a deliberately conflicting word ~50% of the time (`nextTarget`: `if (random() < 0.5)` picks a different color's name), per-answer window ramping `TIMER_MAX = 2.5` → `TIMER_MIN = 0.9` by score via `timerFor(score)` (`TIMER_MIN_SCORE = 180`), scoring `BASE_POINTS = 10` + combo bonus `min(combo * COMBO_STEP(2), COMBO_CAP(10))`, input lockout `PRESS_LOCKOUT = 0.18` with a browser-side key-repeat guard (`lastKeyAt` + `e.repeat`), and the RNG slot-4 guard in `pickIndex`. Canvas now fills tall screens (`.canvas-wrap { flex: 1 1 auto; min-height: 270px }`). Colorblind cue is symbols (triangle/circle/square/diamond) drawn on both token and buttons from `assets/color-symbols.svg`; QA hook is `window.__gameTest` under `?qa=1`; accent lilac `#bd9cff`. On native: `lens-projects/color-panic-lens` is the committed reference project (commit `8dfb81a`) — GameCamera/GameCanvas/PlayArea at ±0.90/±0.70, TargetText (0,0.35), TargetSymbol (0,0.08), four Choice groups in a 2x2 grid, all inputs wired, preview runs clean in Lens Studio 5.24. **Device verification has NOT been done**; native visuals are still placeholder text-on-dark (per-color materials unassigned), and the duplicate `GameController N.js` asset cleanup noted in `docs/SNAPCHAT-HANDOFF.md` is open.

| Slice | Name | One-line goal | Effort |
|---|---|---|---|
| S1 | Feel & Juice (browser) | Deepen hit feedback: ring burst, combo tiers, token transition, heart-loss shake, red edge flash — reduced-motion safe | M |
| S2 | Fairness & Cognitive Load (core) | Confusion-matrix audit of word/ink pairings, difficulty-scaled window floor, a11y cue pass, deterministic fixtures | M |
| S3 | Feature: Alt Modes (core+browser) | Unlockable Sudden Death (1 miss ends) and Marathon (60s, shrinking floor) with mode flag in core + picker | M |
| S4 | Variety & Economy (core+browser) | Rare special tokens — freeze (round timer 3s) and double-points (next 5 answers x2) with last-2s guard | M |
| S5 | Meta & Retention (browser) | Local accuracy stats, per-color weakness recap, best-score history chart, personal-best delta, session stats | M |
| S6 | Native Parity (lens project) | Per-color materials + glyph images on choices, target token parity, native audio; regenerate + re-verify preview | L |
| S7 | Device Validation | Real-phone gates: one-hand grid reach, safe-area tuning, outdoor color legibility, 60fps window timing — NOT claimed done | M |
| S8 | Submission-Ready | 1024px icon, preview video shot list, Snapcode, docs links, final QA ladder, version tag; user submits manually | M |

How to read each slice: every section below carries **Goal / Files changed (real paths) / Implementation steps / Acceptance criteria (name the actual test or check) / Native impact / Effort**. Slices S1-S5 are browser-side and must leave the test suite green on their own; S6-S8 are native/device/submission and none of them may claim completion that only on-device or Snap-side work can grant.

## Constants referenced throughout (all real, from `games/color-panic/core.js`)

| Constant | Value | Meaning |
|---|---|---|
| `ROUND_TIME` | 30 | whole-round countdown, reset in `start()` |
| `START_HEARTS` | 3 | wrong press or target expiry costs one |
| `TIMER_MAX` / `TIMER_MIN` / `TIMER_MIN_SCORE` | 2.5 / 0.9 / 180 | `timerFor(score)` linear per-answer window ramp |
| `BASE_POINTS` / `COMBO_STEP` / `COMBO_CAP` | 10 / 2 / 10 | `BASE_POINTS + min(combo * 2, 10)` per hit |
| `PRESS_LOCKOUT` | 0.18 | `lockTimer` input lock after every press |
| `SLOT_COUNT` | 4 | grid slots; `nextTarget` forbids immediate repeats |

App-layer anchors: guarded best key `color-panic-best`, accent `#bd9cff` (`--accent`), sprite `assets/color-symbols.svg` (256x64, four 64x64 frames), grain `assets/ink-grain.svg`, QA gate `?qa=1` → `window.__gameTest`, recap-once guard `ended` in `app.js`.

---

## S1 — Feel & Juice (browser)

**Goal:** Make correct answers feel rewarded and mistakes feel costly without touching core rules.

**Files changed:** `games/color-panic/app.js`, `games/color-panic/style.css`, `games/color-panic/index.html` (combo-pop markup if tiers need it).

**Implementation steps:**
- Correct-answer: keep the existing 14-particle `burst()` but add an expanding ring shockwave at the token — `drawToken` already draws the ring timer arc from `targetTimeLeft / targetTimeTotal`; add a separate short-lived ring (array of `{age, color}` like `particles`) that scales from the token radius `r + 10` outward ~40px over 300ms, stroked in `COLORS[slot].hex`, fading alpha.
- Deepen the combo popup (`comboEl`, currently shown whenever `combo >= 3` with plain `COMBO x<n>  +<points>`): tier labels — x3 "NICE", x5 "HOT", x8 "ON FIRE" — and keep the `void comboEl.offsetWidth` restart trick; add a per-tier class so CSS can scale color intensity toward `--accent-deep #8f6cff`. Step the `sfx.good` pitch ramp per tier (base is already `440 + min(combo,8) * 60`).
- Wrong-answer: `shake()` exists (4-step ±4px interval on `canvas.parentElement`); add a red edge flash — CSS class `.flash-bad` on `.canvas-wrap` pulsing an inset `box-shadow: 0 0 0 3px #ff5d7d` for ~250ms, synced with `sfx.bad` (150Hz sawtooth). Remove the class on animationend or a timer.
- Token transition: on every `freshTarget` (hit, wrong, expiry) play a 150ms scale-in on the token — a `tokenAnim` timer decremented in the frame loop, mapped in `drawToken` to `scale = 0.85 + 0.15 * ease(tokenAnim)` around the existing `pulse` transform.
- Heart loss: pulse the `.hearts` HUD cell with a CSS keyframe shake + brief `#ff5d7d` tint (`.hearts .lost` already greys out the lost heart); trigger it on expiry losses too, not just wrong presses — detect via `lastOutcome.reason === 'expired'` in the frame loop.
- Gate every new effect behind the existing `reduceMotion` flag (`burst()` and `shake()` already early-return on it); extend the `prefers-reduced-motion` block in `style.css` (it already disables `.combo-pop.show` and button transitions) to neutralize `.flash-bad` and the hearts shake.

**Acceptance criteria:**
- `node --test games/color-panic/core.test.cjs games/color-panic/roundtimer.test.cjs` still green (no core edits — `nextTarget`, `timerFor`, `pressSlot` untouched).
- `node games/color-panic/browser-round.test.cjs` still passes all 11 existing checks; add 1-2 checks to that file: with Playwright's `reducedMotion: 'reduce'` emulation, no `.combo-pop.show` animation runs and `.flash-bad` is never added; with default settings, a scripted wrong press via `__gameTest.press` adds `.flash-bad` and removes it within 500ms.
- Manual `?qa=1` pass: ring shockwave on hit, tiered combo text at x3/x5/x8, edge flash + hearts pulse on wrong/expiry, token scale-in on every target change — all absent under reduced motion.

**Native impact:** None. Browser-only; do not regenerate `lens/GameController.js` (core is untouched, so `tests/native-adapter.test.cjs` exact-source check stays green trivially).

**Effort:** M.

---

## S2 — Fairness & Cognitive Load (core)

**Goal:** Measure and control how confusable the Stroop pairings actually are, and scale the per-answer window to that difficulty; strengthen non-color cues.

**Files changed:** `games/color-panic/core.js`, `games/color-panic/core.test.cjs` (or a new `games/color-panic/confusion.test.cjs`), `games/color-panic/app.js`, `games/color-panic/style.css`.

**Implementation steps:**
- Add a confusion model next to `COLORS` (each entry already carries `hex` + `dark` variants): a hue-family table marking pairs that are genuinely confusable at a glance — e.g. `RED↔YELLOW` (warm family) and `GREEN↔BLUE` (cool family) — vs trivially dismissible pairs (`RED↔GREEN`, `BLUE↔YELLOW`-class cross-family contrasts). Export it (`CONFUSABLE`, a 4x4 boolean lookup) alongside the existing export block (`COLORS`…`ROUND_TIME`).
- Change `nextTarget`'s conflict branch: today any of the other 3 names is equally likely (`word = pickIndex(random, SLOT_COUNT - 1); if (word >= slot) word += 1;`). Bias the draw so ≥ half of conflicting words name a same-family color (the real Stroop trap — the word nudges you toward the *wrong but nearby* button) instead of uniformly spreading over easy pairs. Keep the ~50% conflict rate (`random() < 0.5`), the no-immediate-repeat rule, and the `pickIndex` slot-4 guard untouched.
- Difficulty-scaled window: `freshTarget` currently sets `timeTotal = timerFor(score)` — a pure linear ramp `TIMER_MAX(2.5) → TIMER_MIN(0.9)` over `TIMER_MIN_SCORE(180)`. Add a flat bonus for confusable targets (`CONFUSION_BONUS ≈ 0.15`), so a confusable target at the floor gets ~1.05s while non-confusable targets keep the exact `0.9` floor. Document both numbers next to the existing timer constants.
- Deterministic fixtures (injected RNG, like the existing `deterministic: same seed` test): (a) conflict rate stays ~50% over N=200 fresh targets; (b) same-family share of conflicts ≥ 40%; (c) for a forced-confusable draw, `getState().targetTimeTotal >= timerFor(score) + CONFUSION_BONUS - 1e-9`, and for a forced-easy draw it equals `timerFor(score)` exactly; (d) the fixtures assert the pairing *matrix* (ink, word) distribution, not just counts, so a future tweak can't silently make all conflicts easy.
- Accessibility pass in the app layer: the token word is `r * 0.32` font and buttons draw the symbol at `min(rect.w, rect.h) * 0.21` offset `rect.w * 0.18` from center — bump the button glyph size/contrast (double-stroke the symbol or add a `#15121b` halo so it survives the grain backdrop), and document a high-contrast palette option: swap the four `hex` values for colorblind-safe equivalents behind a `?hc=1` flag (consistent with the existing `?qa=1` pattern), listed in the README with the exact hex values.

**Acceptance criteria:**
- `node --test games/color-panic/confusion.test.cjs` (or the extended `core.test.cjs`) passes all new fixtures; the existing 19 core tests stay green — the `pickIndex` RNG slot-4 guard, the no-repeat rule, and the ~50% conflict rate must survive intact.
- Window assertions: for a deterministic confusable draw, `getState().targetTimeTotal` reflects the bonus; for a non-confusable draw it equals `timerFor(score)` exactly; the `timer shrinks toward 0.9s minimum` test in `core.test.cjs` still passes unchanged (the bonus is additive on top, never below the floor).
- Regenerate `games/color-panic/lens/GameController.js` via `node scripts/build-lenses.cjs`; `tests/native-adapter.test.cjs` "native bundle embeds exact core source" stays green.
- README documents the high-contrast palette values and the `?hc=1` flag next to the existing `?qa=1` note.

**Native impact:** Core changed → regeneration required (see above). Native inherits the new pairings/window automatically on next Studio import; no new @inputs needed.

**Effort:** M.

---

## S3 — Feature: Alt Modes (core + browser)

**Goal:** Two unlockable alt modes beyond Classic: Sudden Death and Marathon.

**Files changed:** `games/color-panic/core.js`, new `games/color-panic/modes.test.cjs`, `games/color-panic/app.js`, `games/color-panic/index.html`, `games/color-panic/style.css`.

**Implementation steps:**
- Core: add `opts.mode` (`'classic' | 'sudden' | 'marathon'`, default classic), stored per-instance and exposed in `getState().mode`. Sudden Death = `createGame({ mode:'sudden' })` behaves as 1-heart play (internally `hearts: 1`): the first wrong press OR the first target expiry ends the round with `phase: 'over'`, hearts `0`, score preserved. Marathon = per-instance round length `MARATHON_TIME = 60` instead of the shared `ROUND_TIME = 30` constant, and a mode-aware window floor: `floor = TIMER_MIN - 0.05 * Math.floor(correctCount / 10)`, clamped at an absolute minimum `MARATHON_FLOOR = 0.5`. Track `correctCount` in the instance; `timerFor` keeps its score ramp but honors the mode floor.
- Mode is core-pure and unguarded: unlock gating stays entirely in the browser. `app.js` reads the current best from the existing guarded `localStorage` key `color-panic-best` (`BEST_KEY`); Marathon and Sudden Death unlock at best ≥ 20, otherwise render locked (greyed swatch + "Best 20 to unlock"). Sudden Death HUD shows a single heart (`maxHearts: 1` flows through the existing hearts loop in `syncHud`).
- Start panel picker: add a mode selector to the start overlay in `index.html` (three-button segmented control inside the existing `.controls` / overlay card, keyboard selectable via arrow keys or 1-3, 44px targets, `aria-pressed` state like `muteBtn`); `startGame()` builds a fresh `PG.createGame({ mode, random: Math.random })` — note this replaces the module-level `game` singleton, so the `?qa=1` hook must re-bind.
- Recap labels the mode: add a "Mode" row to the `.recap` `<dl>` (which currently has Score / Best combo / Best ever); `endRound` fills it from `getState().mode`. Add a small mode chip near the HUD during play — Marathon's 60s countdown shows naturally through `roundTimeLeft`.
- Tests: new `games/color-panic/modes.test.cjs` — sudden: first `pressSlot(wrong)` ends with `phase: 'over'`, score intact; first expiry also ends. Marathon: `roundTimeLeft` starts at 60; window floor after 10 correct is `0.85` (±1e-9), after 20 correct `0.80`, and clamped at `0.5` after 80; wrong answers do not raise the floor back. Classic unchanged: 30s round, `0.9` floor, same sequences as `core.test.cjs`. Note: `package.json`'s `test` script lists color-panic test files explicitly (`games/color-panic/core.test.cjs games/color-panic/roundtimer.test.cjs`), so this slice adds `games/color-panic/modes.test.cjs` to that glob — a one-line root `package.json` edit, which is parent-owned; coordinate or temporarily fold the tests into `roundtimer.test.cjs`.

**Acceptance criteria:**
- `node --test games/color-panic/modes.test.cjs` green; all existing color-panic tests green; `npm test` green after the glob update.
- Sudden Death: first wrong press ends with `phase: 'over'` and score preserved; first expiry also ends; `getState().mode === 'sudden'`.
- Marathon: `roundTimeLeft` starts at 60; floor after 10 correct is `0.85` (±1e-9), after 20 correct `0.80`, clamped at `0.5` after 80; classic sequences unchanged (30s, `0.9` floor).
- Browser: with `color-panic-best` seeded to 25, both modes selectable; seeded to 10, both locked; recap shows the played mode; after starting Marathon the `__gameTest.getState().roundTimeLeft` reads 60 (proves the re-bound singleton).
- `node games/color-panic/browser-round.test.cjs` still green.

**Native impact:** Core changed → regenerate via `node scripts/build-lenses.cjs`. Native stays Classic-only for now (adapter calls `PocketCore.createGame(GAME_ID===... ? {random:Math.random} : ...)` with no mode) — that is acceptable and honest: note it in `lens/SETUP.md` rather than half-wiring a native mode picker.

**Effort:** M.

---

## S4 — Variety & Economy (core + browser)

**Goal:** Rare special tokens that create push-your-luck moments without breaking the Stroop rule.

**Files changed:** `games/color-panic/core.js`, new tests in `games/color-panic/modes.test.cjs` (rename to `features.test.cjs` if cleaner) or `core.test.cjs`, `games/color-panic/app.js`, `games/color-panic/index.html`, `games/color-panic/style.css`.

**Implementation steps:**
- Core: on each correct answer, if `roundTimeLeft > 2` (the last-2s guard — specials must never fire in the final 2 seconds of the round) and no special is active, roll once with the injected RNG at `SPECIAL_CHANCE ≈ 0.12`. Export the constant. Snapshot contract: `special: { kind: 'freeze' | 'double' } | null` for the just-granted token, plus live fields `roundFrozen: boolean`, `freezeLeft: number`, `doubleShots: number` so renderers and tests read everything from `getState()`.
- Freeze: `freezeTimer = 3`; in `update(dt)`, while `freezeTimer > 0` decrement it first and skip the whole-round countdown (`roundTimeLeft` does not tick). The per-target window keeps ticking — the player must keep answering while the round clock is paused, which preserves the panic. `roundFrozen: true` only while `freezeTimer > 0`. Freeze must also survive the expiry carry loop unchanged.
- Double points: `doubleShots = 5`; the next 5 correct answers score `2 * (BASE_POINTS + comboBonus(combo - 1))` (so up to 2 * (10 + 10) = 40 at max combo). Decrement on each hit; `lastOutcome` gains a `multiplied: true` flag for the renderer. Note the interplay: doubled points accelerate the score ramp, shrinking windows faster — intended, tests should pin it.
- Spawn discipline: specials never spawn from expiry or wrong presses (roll lives only in the correct-answer branch of `pressSlot`); a new special cannot start while one is active (freeze and double don't stack); both reset in `start()` alongside `combo`/`lockTimer`.
- Browser: HUD chip row under the token (snowflake + "ROUND PAUSED 3s" during freeze; "x2 · 4 left" during double), a badge drawn inside `drawToken` so the *upcoming* special is visible before it lands, distinct SFX (reuse `beep()` with a new pattern), and chips are icon+text, never color-only. Wire into `syncHud` and expose `__gameTest.forceSpecial(kind)` behind the existing `?qa=1` gate for tests.

**Acceptance criteria:**
- Deterministic RNG tests: a seed that triggers freeze shows `roundTimeLeft` frozen for exactly 3.0s of accumulated `update()` while `targetTimeLeft` still decreases; double applies x2 to exactly 5 hits then reverts (the 6th hit scores normally); a roll attempted when `roundTimeLeft <= 2` never spawns (drive the clock to 1.9s and assert no special); no special survives `start()`.
- Expiry-carry safety: the existing large-`dt` semantics test in `core.test.cjs` (`update with huge/negative dt is safe`) still passes with freeze active mid-carry.
- All existing tests green; `tests/native-adapter.test.cjs` green after regeneration.
- Browser: with `?qa=1`, `forceSpecial('freeze')` shows the "ROUND PAUSED" chip and `forceSpecial('double')` shows "x2 · 5 left"; chips disappear when the state clears.

**Native impact:** Core changed → regenerate. The embedded core brings specials to native for free on the next import; native HUD chips are a render-layer nicety — acceptable to defer to S6, but note it in `lens/SETUP.md`.

**Effort:** M.

---

## S5 — Meta & Retention (browser, local-only)

**Goal:** Give players a reason to return: accuracy stats, weakness breakdown, history chart, personal-best delta — all guarded-localStorage, nothing leaves the device.

**Files changed:** `games/color-panic/app.js`, `games/color-panic/index.html`, `games/color-panic/style.css`. Core stays untouched (data is computed app-side).

**Implementation steps:**
- Response timing without core changes: in `doPress`, read the state *before* pressing — `s.targetTimeTotal - s.targetTimeLeft` is the elapsed time on the current target; multiply by 1000 for ms and accumulate only on hits (`r.hit === true`). Keep a session accumulator `{ hits, sumMs, wrong, expired }`.
- Per-color weakness: record the target color index on every miss. For wrong presses `lastOutcome.slot` is the *pressed* slot, so capture `s.targetIndex` before the press instead. For expiry, capture `targetIndex` in the frame loop just before `game.update(dt)` when the expiry loop is about to consume it (the post-update state has already advanced the target). Tally misses+expiries per `COLORS[i].name` and show the worst on the recap ("Weakest: BLUE — 4 misses"); ties and zero-miss rounds show nothing.
- History: extend storage beyond `BEST_KEY` with `color-panic-history` (same guarded try/catch pattern), a capped ring buffer of the last 30 entries `{ score, mode, ts }`. Render a small inline-SVG sparkline in the recap card (no canvas dependency, no animation, so reduced-motion needs nothing special).
- Best delta: the recap already computes `overlay.dataset.prevBest` in `endRound` to drive the "New personal best" star — surface the actual delta line ("+35 over your previous best of 120") in `#newBest` or a sibling; when the round is *not* a record, show "Best: 120 (+35 to beat)". Both read the same guarded value.
- Session stats row on the recap: mean response ms (hits only), accuracy % = hits / (hits + wrong + expired), best combo (already present as `finalCombo`), hearts remaining. Add `__gameTest.getStats()` (qa-gated) returning the tallies so browser tests assert on them.

**Acceptance criteria:**
- `node --test` color-panic suites still green (core untouched — this slice adds zero lines to `core.js`).
- `browser-round.test.cjs` additions: play a scripted round via `__gameTest` with one wrong press on a known target color; the recap weakness line names that color; `localStorage.getItem('color-panic-history')` parses as JSON and contains the round entry; a second round below best shows the delta text with the correct previous value; `getStats()` mean-ms is a positive finite number after ≥ 2 hits.
- Storage-unavailable path: stub `localStorage` to throw before load and verify the game still plays and recaps (the existing guarded pattern must extend cleanly). Grep confirms only `color-panic-best` and `color-panic-history` are ever written and there are no network calls.

**Native impact:** None. This is browser/local-only by design; native persistentStorage keeps storing only the single best int (`pocket-party-color-panic-best`), per `native/README.md`.

**Effort:** M.

---

## S6 — Native Parity (lens project)

**Goal:** Close the visual/audio gap between the browser game and `lens-projects/color-panic-lens` (the committed reference project) without regressing the other two games' shared adapter.

**Files changed:** `games/color-panic/lens/GameController.js` (generated), `native/adapter.js` (shared — only if a script-driven change is unavoidable), `lens-projects/color-panic-lens/` (scene, materials, images), `native/README.md` Color Panic section, `games/color-panic/lens/SETUP.md`, `docs/SNAPCHAT-HANDOFF.md` status block.

**Implementation steps:**
- Choice buttons: each choice is a *fixed* color, so per-color materials are static scene setup, not script work — create four tinted materials in Studio (one per `COLORS[i]`) and assign them to the four choice Screen Images per `native/README.md` ("Native block/basket visuals use default white materials" is the known open item from the handoff). For symbol parity, use the glyph images already imported in the project — `lens-projects/color-panic-lens/Assets/Imported/red-triangle.png`, `green-circle.png`, `blue-square.png`, `yellow-diamond.png` — as Screen Images inside each choice group, keeping the `choiceLabels` text as the key-number/name line. Prefer static assignment over new @inputs so the generated controller and `tests/native-adapter.test.cjs` wiring stay untouched.
- Target token parity: add a static dark disk Screen Image behind TargetText/TargetSymbol. The browser token is a `#15121b` disk with the word rendered in the target ink color — the native controller's `color()` call on `targetText`/`targetSymbol` (`textFill` from the hex) already reproduces the ink coloring, and the unicode glyphs (`▲ ● ■ ◆`) match the browser symbols; the missing piece is the dark backdrop and the ring-timer look, which can stay simplified but must be documented as such in `SETUP.md`.
- Native audio: add short Audio Track assets + Audio Components for hit / wrong / expire / game-over and trigger them from the adapter's outcome paths. This is the one change likely to touch `native/adapter.js` — keep it additive and fully guarded (null checks, try/catch) because snack-catch and stack-rush share the file; `tests/native-adapter.test.cjs` must stay green for all three games. `native/README.md` currently states there is "no native audio" — update that sentence only when audio actually exists in preview.
- If @inputs or adapter code change at all: regenerate with `node scripts/build-lenses.cjs` (it embeds `games/color-panic/core.js` verbatim between CORE-BEGIN/CORE-END), re-import into `ColorPanic.esproj`, re-wire the Inspector inputs, and re-verify the Lens Studio 5.24 preview (start/score/fail/restart/pause, Logger clean except the two documented benign deprecation warnings, phone-aspect preview resize) following `docs/SNAPCHAT-HANDOFF.md` checklist items 1-4.
- Studio housekeeping from the handoff's open-items list: delete the unused duplicate `GameController N.js` asset(s) via the Asset Browser, and confirm `Assets/Untitled JavaScript Component.js` is not a stray re-import that should go too.

**Acceptance criteria:**
- `npm test` green, including `tests/native-adapter.test.cjs` exact-source equality for color-panic's embedded core after any regeneration.
- Preview (Studio, not device): four choices show distinct per-color fills + glyphs; target word/symbol tint follows the ink color; pause/resume/restart untouched; Logger has no new errors beyond the two documented benign deprecation warnings.
- `docs/SNAPCHAT-HANDOFF.md` updated to say *what* is now verified in preview and what still is not. No device claims here.

**Native impact:** This is the native slice. Device validation remains explicitly open and is S7's job.

**Effort:** L.

---

## S7 — Device Validation

**Goal:** Run the real gates on a phone running Snapchat. **This slice is not complete until someone actually does it — do not mark done in docs.**

**Prerequisites:** Lens Studio 5.24 installed and signed in; one physical phone with Snapchat paired to Studio preview; both indoor and outdoor test locations; the S6 material/glyph work merged so the gates test the *real* rendering, not white placeholder boxes. If S6 has not landed, run this slice anyway and expect the color gate to fail trivially.

**Files changed:** `docs/SNAPCHAT-HANDOFF.md` (checklist items 5-6 ticked with dates/notes), `native/README.md` (only if anchor values change), `games/color-panic/lens/SETUP.md` notes.

**Implementation steps:**
- Pair a phone to Lens Studio and run the lens on-device (handoff checklist item 5). Record device model, OS, Snapchat version in the handoff notes before starting the gates.
- One-hand reachability: the 2x2 grid sits at PlayArea y = -0.34 (top row) and y = -0.72 (bottom row), each choice 0.86 wide / 0.28 high (`native/README.md` Color Panic section). Pass: 10/10 top-row taps and 10/10 bottom-row taps one-handed without re-gripping, zero accidental hits on the adjacent button. If the top row fails, tune choice anchor y toward -0.28 in the scene and re-test — record the final anchor values in `native/README.md`.
- Safe-area: confirm the ±0.90/±0.70 PlayArea anchors clear the Snapchat capture button, chat bar and camera-flip controls on the tested device (the README itself warns these are "starting values, not a safe-area guarantee"). Pass: no gameplay element occluded by any Snapchat control in portrait; the pause button at (0.82, 0.90) is tappable with an effective ≥ 44px hit region.
- Color under camera passthrough: test outdoors in direct sun plus indoors under warm light. The four inks (`#ff5d5d`, `#3ddc84`, `#4aa8ff`, `#ffd23f`) plus the lilac accent `#bd9cff` must stay distinguishable at arm's length. Pass: 10 consecutive correct matches outdoors without hesitation; if RED/BLUE wash out, swap in the S2 high-contrast palette natively and re-run the gate.
- Window timing at device latency: with the floor at `TIMER_MIN = 0.9`, verify a deliberate late tap (ring nearly closed) still registers rather than being swallowed by touch latency, and that a full 30s round at 60fps shows no drift between the `roundTimeLeft` HUD and wall clock. Pass: zero presses lost to latency in a 30-target drill; round end within ±0.5s of 30s wall time. If S4's freeze special is live by then, verify the 3s freeze visibly pauses the round countdown on device too.
- Persistence and interruption: best score survives lens close/reopen (`persistentStorageSystem` getInt/putInt path), an incoming call or app switch fires the adapter's `OnDisableEvent` pause and resumes cleanly without losing the target, and S6's audio plays and mutes correctly.

**Acceptance criteria:** Each gate above has a written pass/fail note with device model and date in `docs/SNAPCHAT-HANDOFF.md`. Anything failing is filed as a follow-up slice rather than papered over. The handoff's status block must still read, in substance, "device verification pending" until every gate has a dated pass.

**Native impact:** This slice *is* the native gate. Until it passes, all docs keep saying "native NOT validated on device."

**Effort:** M (mostly manual time in Studio + on a phone).

---

## S8 — Submission-Ready

**Goal:** Everything Snap's submission flow needs, prepared in-repo; the actual submission stays the user's manual step via their own Snap account.

**Files changed:** `assets/` (new lens icon art — owned by the parent/art lead per repo culture; coordinate), new `docs/color-panic-submission.md` (shot list, links), `docs/SNAPCHAT-HANDOFF.md` (items 8-9), repo tag.

**Implementation steps:**
- Original 1024x1024 lens icon: bold token-with-conflicting-word motif on the lilac `#bd9cff` / `#0a0a0f` scheme, flat opaque fills matching the repo's art rules (no gradients/glow/blur). Verify it reads at 64px before handoff.
- 10-20s vertical (9:16) preview video shot list — every beat from a real played round, no fabricated scores:
  1. 0-3s hook — token flips in with a conflicting word; player taps the *right* button anyway (establish the Stroop rule in one shot).
  2. 3-8s Stroop moments — two deliberate wrong-word matches with the token's ink+symbol cue clearly visible.
  3. 8-13s combo streak — "NICE"/"HOT"/"ON FIRE" tiers, ring burst, combo bonus climbing toward the cap.
  4. 13-16s pressure — ring timer nearly closed, a heart lost, red edge flash, HUD at `low` time color.
  5. 16-20s payoff — "OUT OF HEARTS" recap with score/best, "REPLAY" tap. If S3/S4 are live by this shoot, prefer Marathon footage (60s arc reads better) and show one special token.
- Snapcode: after Snap review assigns the lens link, store the Snapcode image and URL in `docs/color-panic-submission.md` and link from `docs/SNAPCHAT-HANDOFF.md` item 9 (until then the handoff keeps saying "share the website only as a browser preview").
- Final QA ladder, run in order and recorded with output tails in the submission doc: `npm ci` → `npm test` → `npm run build` → `npm run test:browser`. Confirm `dist/games/color-panic/` matches the sources and `node scripts/build-lenses.cjs` leaves a clean diff.
- Tag the release (e.g. `color-panic-v1.0.0`) once all green; note the commit in the handoff. Submission itself (Snap account, review timing) is explicitly out of repo scope per `docs/SNAPCHAT-HANDOFF.md` item 8.

**Acceptance criteria:** Icon file exists at 1024px and is referenced in the submission doc; shot list is concrete (timestamps + on-screen state); QA ladder output recorded; tag pushed by the parent (no commits by workers per repo rules). S7 gates must have real pass notes before this slice is called ready.

**Native impact:** Packaging-only (icon/preview/Snapcode). No code changes; `GameController.js` regeneration only if S6 landed later changes.

**Effort:** M.

---

## Sequencing notes

- S1 is independent; S2 should land before S3/S4 (both add core behavior that should build on the fixed confusion/window model). S5 is independent of S3/S4 except recap rows, which absorb mode/special stats naturally.
- Every core-touching slice (S2, S3, S4) ends with `node scripts/build-lenses.cjs` so `games/color-panic/lens/GameController.js` never drifts from `core.js` — `tests/native-adapter.test.cjs` enforces exact-source equality.
- S6 → S7 → S8 is strictly ordered: no submission prep claims device validation that has not happened.

## Risks in the current code these slices must address

- **Word/ink pairings are uniformly random among the 3 wrong colors** (`nextTarget`'s conflict branch) — most conflicts are trivially dismissible, so the Stroop rule is weaker than it feels; S2's confusion matrix and same-family bias is the fix, with fixtures so it cannot regress.
- **The per-answer window never relaxes after mistakes** — `timerFor(score)` is score-only, so a struggling player at high score faces the 0.9s floor regardless of recent misses; S2's confusable-target bonus is the targeted mitigation (a full miss-based relax is deliberately out of scope to keep the ramp spec-pure).
- **S3's mode picker rebuilds the `game` singleton** in `app.js`; the `?qa=1` hook and the frame loop close over the old instance unless `startGame()` re-binds — the S3 acceptance criteria call this out explicitly.
- **S4's freeze touches the `update()` expiry-carry loop** (`while (timeLeft <= 0 ...)` with leftover-carry semantics) — the freeze skip must apply only to `roundTimeLeft`, or carried negative time can double-charge hearts; the modes/features tests pin the carry behavior before and after.
- **Shared `native/adapter.js`** serves all three games; any S6 audio/additive change must keep `tests/native-adapter.test.cjs` green for snack-catch and stack-rush, not just color-panic.
- **`docs/SNAPCHAT-HANDOFF.md` is currently modified in the working tree** (uncommitted, pre-existing) — slice workers should not stash or revert it; append status notes rather than rewriting the file.

---

*Index note for the master roadmap:* file path `docs/slices/color-panic.md`, game slug `color-panic`, 8 slices S1-S8 as tabled above, browser-complete baseline as of 2026-09-26 (tall-canvas fix), native reference project committed as `8dfb81a`, device validation and submission not started. Sibling plans live beside this file (`docs/slices/snack-catch.md`, `docs/slices/stack-rush.md`) under the same slice arc.
