# Snack Catch — Pocket Party

Portrait-first mini-game: drag the basket, catch falling snacks, dodge bombs.
30-second rounds, combo multiplier, 3 hearts. Zero runtime dependencies —
vanilla JS + canvas.

## Play

Open `games/snack-catch/index.html` in any browser (or serve the `pocket-party`
folder statically). Works from 360x640 up to desktop.

## Controls

| Action | Touch / Mouse | Keyboard |
|---|---|---|
| Move basket | Drag anywhere on the canvas | Arrow Left/Right or A/D |
| Start / Replay | Start Game / Play Again button | Space or Enter |
| Pause / Resume | Pause button or Resume button | P or Esc |
| Mute | Speaker button (top right) | — |
| Home | "<- Home" link (top left) -> `../../index.html` | — |

The game auto-pauses when the tab is hidden (`visibilitychange`). Pointer
coordinates are mapped through the canvas bounding rect, so dragging stays
correct on resize, DPR scaling (capped at 1.5), and mobile.

## Mechanics

- 30-second round; timer in the HUD.
- Catch a snack (apple, donut, cookie, banana): **+10 x multiplier**.
- Catch a bomb: **-1 heart** (3 hearts total), combo resets. 0 hearts ends the round.
- Missed snacks break the combo — no hearts lost.
- Every 5 consecutive catches the multiplier goes up, capped at **x3**.
- Fall speed and bomb frequency escalate fairly across the round.
- Collision is swept per frame (line-crossing check against the basket mouth),
  so fast items cannot tunnel through the basket.
- Local best score via `localStorage`, guarded with try/catch (private mode safe).
- Game-over recap: score, caught, missed, bombs hit, final multiplier, new-best flag.
- Share via `navigator.share` with clipboard-copy and prompt fallback. No
  leaderboard — your best score is local only.

## Visuals / Audio

- Background `#0a0a0f`, cards `#1c1c2e`, white text, mint accent `#7dffb2`.
- Gameplay art uses Astra's sprite atlas (`../../assets/snack-sprites.png`,
  six 128px cells: apple, donut, cookie, banana, bomb, basket) drawn onto the
  canvas with cached `Image` objects; simple geometric primitives remain as the
  fallback until the atlas loads. Collision footprints are unchanged — the
  drawn item is ~2x ITEM_R and bombs keep a clearly distinct dark shape with a
  lit fuse (never snack colors).
- Backdrop is an opaque night fill plus the cached `ink-grain.png` stipple
  pattern (created once, reused every frame). No gradients, glow or blur on
  scenery; overlays are opaque panels (no `backdrop-filter`).
- Particle bursts on catches and bombs; disabled under reduced motion.
- Short procedural WebAudio SFX (no audio files) on catch / combo / bomb / miss /
  round end; mute toggle persists.
- `prefers-reduced-motion` disables particles and transitions.
- 44px minimum touch targets on all controls; buttons never start the game by
  accident (game starts only from the Start button or keyboard).

## QA hook

With `index.html?qa=1`, `window.__gameTest` is exposed:
`getState()`, `start()`, `pause()`, `resume()`, `setInput(x)`, `forceOver()`,
and the raw `game` object. Used for automated browser-shell QA; harmless otherwise.

## Architecture

- `core.js` — ES5-compatible UMD game core. No DOM, window, Date, or Lens APIs.
  Deterministic via injected RNG (`PocketGame.mulberry32`). In Node:
  `module.exports`; in browser/Lens: `global.PocketGame`
  (`var root = typeof global !== 'undefined' ? global : this`). Browser loads
  `core.js` before `app.js`.
- `app.js` — browser shell: rendering, input, HUD, overlays, audio, share.
  Uses the exact same core instance API as the Lens adapter.
- `core.test.cjs` — Node built-in test-runner suite (no dependencies).

## Tests

Run:

```
node --test games/snack-catch/core.test.cjs
```

Output (all green):

```
tests 15 | pass 15 | fail 0
```

Covered: start/reset, no-op updates when not playing, input clamping,
scoring + multiplier growth, bomb damage + 3-bomb game over, miss breaks combo
without hearts, time expiration, restart after game over, pause/resume
idempotency + toggle, spawn bounds, fall-speed escalation, swept-collision
anti-tunneling, seed determinism, event queue, module shape.

Browser QA runs against a real browser (Playwright Chromium, `?qa=1`):

```
node games/snack-catch/browser-qa.cjs
```

Covers at 360x640: sprite atlas load, start, real touch catch (score > 0),
pause freeze / resume advance, game-over recap with real score, replay reset,
viewport fit, zero page errors. 8/8 pass. The parent's cross-game suite
(`node scripts/browser-test.cjs`) passes all 15 snack-catch checks.

`node --check` passes on `core.js`, `app.js`, and `lens/GameController.js`.

## Snapchat Lens / native (lens/)

The native pipeline is now centralized at the repo root: see
`../../../native/README.md` for scene setup, API grounding and the honest
validation status, and regenerate the controller that embeds this game's
tested `core.js` **verbatim** with:

```
node ../../../scripts/build-lenses.cjs
```

Generation concatenates this game's `lens/GameController.template.js` with the
exact bytes of `core.js` (reproducible, no manual copy-paste, no
`script.coreModule.api` ScriptAsset module assumption — the core is embedded,
not `require`d). Scene hierarchy, ScreenTransform anchors and input wiring are
documented in `../../../native/README.md`; per-game setup notes remain in
`lens/SETUP.md`. Do not regenerate lens files by hand.

**Native limitation (honest):** Lens Studio is not installed in this
environment, so the generated controller has never been compiled in Lens
Studio and no scene is validated. `TouchStartEvent`/`UpdateEvent` binding
signatures and `ScreenTransform` mapping follow the official docs
(developers.snap.com) but are **UNVERIFIED at runtime**. No claim is made
about Snapchat publication or Lens validation.

