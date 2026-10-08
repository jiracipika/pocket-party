# Turbo Kart

Pocket Party game #6 — a TuxKart-inspired pseudo-3D kart racer, built to the
family contract (deterministic injected-rng core, 360x640 canvas, no
dependencies).

## How it plays

- Auto-throttle: the kart accelerates on its own; you only steer.
- **Hold** the left / right half of the canvas (or tap — a tap steers for a
  short pulse) or use ←/→ / A/D on a keyboard.
- Curves pull you outward at speed (centrifugal); grass caps your speed.
- Bananas spin you out (speed collapses, brief loss of control).
- ⚡ boost boxes add a 2.2s speed-cap raise and bonus points.
- Every quarter lap a checkpoint banner adds **+9s** to the clock (capped at
  45s). The run ends when the clock hits zero. Laps pay 500.

## Rules source of truth

`core.js` — pure ES5 UMD, no DOM / clock / ambient randomness. Randomness is
injected (`createGame({ rng })`); the same seed reproduces a run exactly.
`core.test.cjs` pins the physics, specials, checkpoint scheduling (quarter-lap,
aligned to the final track length), and a purity scan.

## Files

- `core.js` / `core.test.cjs` — rules + fixtures
- `meta.js` / `meta.test.cjs` — daily-seed (FNV-1a date hash) + history ring helpers
- `app.js` — pseudo-3D renderer, input, procedural sfx, QA hook (`?qa=1` → `window.__gameTest`)
- `index.html` / `style.css` — page shell

## Native

No Lens Studio project yet — the native slice is future work in
`docs/slices/turbo-kart.md` (S6), following the same controller-generation and
MCP recipe as the other games. Nothing here is device-validated or published.
