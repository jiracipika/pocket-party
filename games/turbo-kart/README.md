# Turbo Kart

Pocket Party game #6 — a TuxKart-inspired pseudo-3D kart racer, built to the
family contract (deterministic injected-rng core, 360x640 canvas, no
dependencies).

## Ghost racing — race a friend via Snap share

Share your run and anyone who opens the link races **your ghost**: a
translucent silver kart driving the exact line you drove, on the same seeded
track, with a live 🏁 ahead/behind chip and a won/lost verdict on the recap.

- The core records every run (odo + steering line sampled every 250ms of
  play-time, pauses excluded) — `getRecording()`.
- `encodeGhost` packs it into a URL-safe base64 code (~90s of line in under
  1.3k chars: 12-bit distance deltas + 8-bit lane, seeded track id + target
  score in the header). `decodeGhost` never throws; bad links just boot
  ghostless.
- The link carries the track seed, so friend and sender drive identical
  tracks. The ghost is strictly observational — fixture-pinned to never
  touch the simulation.
- **Honesty note:** in this browser preview the ghost rides the share-sheet
  URL (the "send a Snap" path is `navigator.share`). A published Lens would
  pass the same payload through Snap's own deep-link/cloud storage — that
  integration does NOT exist yet; see `docs/slices/turbo-kart.md`.

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
