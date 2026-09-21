# Stack Rush

Tap/Space drops a horizontally oscillating neon block onto the tower.
Overlap becomes the new layer, overhang is trimmed off as falling debris,
zero overlap ends the round. Alignment within 4 logical px snaps the layer
("PERFECT") and builds a combo bonus. Speed rises per layer and is capped.
Portrait-first, zero runtime dependencies.

## Files

    games/stack-rush/
      index.html          browser shell (loads core.js BEFORE app.js)
      style.css           #0a0a0f bg / #1c1c2e cards / #ffe66d accent
      app.js              rendering, input, WebAudio SFX, particles
      core.js             ES5 UMD game core (Node + browser + Lens), no DOM/Date/RNG
      core.test.cjs       node:test suite — 16 tests
      browser.smoke.cjs   REMOVED — superseded by root scripts/browser-test.cjs (Playwright)
      check-embed.cjs     REMOVED — superseded by tests/native-adapter.test.cjs
      lens/GameController.js  Lens Studio controller (self-contained core)
      lens/SETUP.md       scene hierarchy, wiring, verified-doc notes

## Controls

- Tap / click canvas or Space — drop block (also starts / retries)
- P or pause button — pause / resume (auto-pauses on tab hide)
- M or speaker button — mute (short procedural WebAudio SFX otherwise)
- R — restart during play or after game over
- All buttons are >= 44px touch targets with keyboard equivalents

## Mechanics

- 360x640 logical field; block oscillates and bounces at field bounds
- Overlap interval with the layer below becomes the placed width; trim is
  spawned as physics debris that expires after 1.4s
- PERFECT: within 4px -> full width restored, +1 layer +1 per streak point
  (consecutive perfects: +2, +3, ...); any non-perfect drop resets streak
- Width below 12px or zero overlap = game over with recap (score, perfect
  count, best streak, personal best)
- Speed: 120 -> +8/layer -> capped at 340 logical px/s
- Camera pans (cameraY) once the tower top passes an 80px deadzone, so tall
  towers never stack offscreen
- Best score in guarded localStorage (falls back to in-memory if blocked)
- Share via navigator.share with clipboard/text fallback

## Scoring example

First drop +1. Three consecutive perfects: 1 + (1+1) + (1+2) + (1+3) = 10.

## Tests (verified output)

    $ node --test games/stack-rush/core.test.cjs
    ✔ core is UMD: exports under Node, PocketGame under globals
    ✔ start: phase playing, one moving block, score 0, first layer easy
    ✔ input start from ready; unknown actions ignored per phase semantics
    ✔ first drop creates base layer, +1 score, spawns next block
    ✔ perfect alignment within 4px snaps width, awards streak bonus
    ✔ off-center drop trims overhang and preserves overlap width
    ✔ zero overlap ends round with phase over
    ✔ debris falls and expires (bounded lifetime)
    ✔ time-driven movement: update bounces block at field bounds
    ✔ speed rises per layer and is capped
    ✔ paused: update does not move block or judge logic (frozen state)
    ✔ restart after game over resets score, layers, phase
    ✔ determinism: same rng seed + same inputs -> identical state
    ✔ camera follows tower as it grows
    ✔ layers remain inside field bounds after many drops
    ✔ tap is alias for drop/start/restart depending on phase
    tests 16  pass 16  fail 0

    $ node --test games/stack-rush/core.test.cjs
    tests 16  pass 16  fail 0

    $ node --test tests/native-adapter.test.cjs
    6/6 pass (contract tests with Lens API test doubles — NOT native validation)

    $ npm run test:browser   (scripts/browser-test.cjs, Playwright, root-owned)
    all PASS for stack-rush: start/pause/resume, keyboard+touch scoring, failure,
    replay, best persistence, 360x640 and 1280x720 viewports, QA hook gating

    $ node --check core.js app.js lens/GameController.js   (all pass)

## Browser QA hook

Open with `?qa=1` to expose `window.__gameTest` =
{ getState, drop, start, pause, resume, setInput, toLogical, best }.

## Art assets

`app.js` caches `assets/ink-grain.png` and `assets/block-grain.png`
(parent-owned, copied to `dist/assets/` by `scripts/build.cjs`). The ink tile
replaces the flat #0a0a0f background as an opaque pattern; the warm-yellow
stipple is clipped inside blocks over the hue fill. Existing primitives render
until the images load or on error — gameplay, collisions and inputs unchanged.

## Lens Studio (native) — limitations, honestly stated

- Lens Studio was NOT installed in this environment, so
  `lens/GameController.js` has never executed natively. It is
  `node --check`-clean and its embedded core is byte-verified equal to
  `core.js` by `tests/native-adapter.test.cjs`, but no Lens preview was run.
- Module loading was verified against official Snap docs (Script Modules use
  CommonJS `module.exports` / `require("Name")`):
  https://developers.snap.com/lens-studio/features/scripting/script-modules
  The `@input Asset.ScriptAsset` + `.api` pattern is not the documented
  mechanism and was not used; the controller is self-contained instead.
- Native visuals are intentionally simplified (flat Screen Images/Text, no
  particles/debris/textures). No claim is made about Snapchat publication,
  Lens validation, or review.
- Safe area: tap-anywhere input; text kept out of the top 8% / bottom 15%
  where Snapchat UI overlays live. Full wiring steps in lens/SETUP.md,
  which points at the maintained `native/README.md`.

## Reproducing the Lens controller's embedded core

Regenerate all three controllers from the project root:

    node scripts/build-lenses.cjs

The generator embeds each `games/<slug>/core.js` verbatim; byte equality is
enforced by `tests/native-adapter.test.cjs` (included in `npm test`).
