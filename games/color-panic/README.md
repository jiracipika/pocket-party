# Color Panic

Stroop-style arcade mini-game. A central token glows in one of four colors
and shows a shape symbol; a **conflicting color word is printed inside it**.
Match the token's **ink color + symbol** — never the word. Four big buttons,
30-second instincts, combos, and a shrinking timer.

Zero runtime dependencies. Vanilla JS + canvas.

## Play (browser)

Open `games/color-panic/index.html` in any browser, or serve the folder:

```
cd games/color-panic && python3 -m http.server 8123
# http://localhost:8123/index.html   (add ?qa=1 for the QA hook, ?hc=1 for the high-contrast palette)
```

## Controls

| Action | Touch / Mouse | Keyboard |
|--------|---------------|----------|
| Answer | Tap the matching color button | `1` `2` `3` `4` |
| Start / Replay | START / REPLAY button | `Enter` |
| Pause / Resume | Pause button, or auto-pause on tab hide | `P` |
| Mute | Speaker button | `M` |
| Share score | SHARE button (navigator.share → clipboard/text fallback) | — |
| Home | House icon → `../../index.html` | — |

## Mechanics

- Match the token's **color + symbol** (shape glyph: ▲ ● ■ ◆); the word
  inside is often wrong on purpose — that's the Stroop trap. The token is
  a dark disk with the word rendered **in the target ink color** plus the
  matching colored symbol, so the correct answer is always unambiguous.
- **30-second round timer** (`roundTimeLeft` in `getState()`): resets on
  start/replay, ticks only while playing (pause freezes it), and ends the
  round at 0 even for a perfect player with hearts left. Live countdown in
  the HUD `TIME` cell (turns red under 10 s).
- +10 per correct hit, combo bonus +2 per combo step, capped at +10
  (max +20 per hit).
- 3 hearts. Wrong answer or target-timer expiry costs one heart and advances
  the target; 0 hearts ends the round.
- Per-target timer starts generous (2.5 s) and shrinks with score down to a
  0.9 s floor (reached at 180 points).
- No target repeats back-to-back; 0.18 s input lockout plus key-repeat
  filtering prevents accidental double inputs.
- The frame loop detects the core's `playing → over` transition, so the
  recap shows exactly once however the round ends. Replay resets score,
  hearts, combo, particles and the pause `aria-pressed` state.
- Art: `assets/color-symbols.svg` (cached `Image`) draws the token symbol
  and all four button glyphs; `assets/ink-grain.svg` is tiled as the canvas
  backdrop. Both are non-blocking — canvas primitives render until (and if)
  the images load.
- Best score persisted via `localStorage` behind try/catch guards (private
  mode safe — game just won't remember your best).

## Test output

```
$ node --test games/color-panic/core.test.cjs        # 19 pass
$ node --test games/color-panic/roundtimer.test.cjs  # 4 pass (round-timer rules)
$ node --test tests/parent-regressions.test.cjs      # 6 pass (30 s round end)
$ node games/color-panic/browser-round.test.cjs      # 10/10 real-browser PASS
```

Round-timer coverage: reset on start, frozen while paused, expiry ends the
round under perfect play, and the round timer wins the same-tick race
against a per-target expiry (no heart charged).

Covers: start state, correct/wrong scoring, combo cap, hearts depletion,
game over by hearts and by expiry, timer shrink + 0.9 s floor, no-repeats,
double-input lockout, key mapping, pause/resume freezing, restart reset,
determinism (injected RNG), RNG-usage assertion, input bounds, huge/negative
dt safety, and a source scan proving the core has no DOM/clock/randomness.

`node --check` passes on `core.js`, `app.js`, and
`lens/GameController.js`. The Lens controller additionally runs the
**verbatim embedded copy** of the same tested core; `lens/embedded-core.check.cjs`
re-proves behavioral identity after every rebuild.

## Architecture

- `core.js` — ES5-compatible UMD. In Node: `require('./core.js')`. In the
  browser it loads **before** `app.js` and exposes global `PocketGame`.
  No DOM, no clock, no ambient randomness: time enters via `update(dt)`,
  randomness is injected (`createGame({ random })`). All game rules are
  here; both the browser app and the Lens adapter run this exact code.
- `app.js` — browser UI: canvas renderer, DPR-capped (≤1.5) sizing,
  pointer→slot mapping on resize/mobile, particles, WebAudio SFX, HUD,
  overlay recap, share, visibilitychange auto-pause, `?qa=1` test hook.
- `lens/GameController.js` — generated Lens Studio controller (see
  `lens/SETUP.md` and `lens/build-lens.cjs`).

### High-contrast palette

Load `index.html?hc=1` (same pattern as `?qa=1`) to swap the four inks for a
colorblind-safe Okabe-Ito subset — useful for deuteranopia/protanopia and on
washed-out screens. The answer symbols (triangle/circle/square/diamond) are
unchanged and still match button-for-button:

| Color  | Default   | High contrast |
|--------|-----------|---------------|
| RED    | `#ff5d5d` | `#e69f00` (orange) |
| GREEN  | `#3ddc84` | `#009e73` (bluish green) |
| BLUE   | `#4aa8ff` | `#56b4e9` (sky blue) |
| YELLOW | `#ffd23f` | `#f0e442` (yellow) |

### QA hook

Load `index.html?qa=1` and use `window.__gameTest`:
`getState()`, `getBest()`, `press(slot)`, `keyPress('1'..'4')`, `start()`,
`togglePause()`, `shareText()`, `canvasSlotAt(x, y)`, plus direct button
element refs. Absent without the query flag.

## Native (Lens Studio) limitation

The `lens/` folder contains a complete controller + setup recipe, with the
Snap Scripting API calls (TouchStartEvent/getTouchPosition,
ScreenTransform.containsScreenPoint/screenPointToLocalPoint, anchors
setCenter/setSize) **verified against the official docs at
developers.snap.com**. However, **Lens Studio is not installed in this
build environment, so the scene has never been opened, previewed, or
validated, and nothing here has been published to Snapchat.** A few
editor-side details (Component.Text assignment, token material swapping)
are flagged unverified in `lens/SETUP.md`.
