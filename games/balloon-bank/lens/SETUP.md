# Balloon Bank — Lens Studio setup (stub)

Not assembled yet: S6 of docs/slices/balloon-bank.md creates
`lens-projects/balloon-bank-lens/` with the shared MCP recipe
(see docs/SNAPCHAT-HANDOFF.md). The generated controller will appear here as
`GameController.js` once the game is registered in scripts/build-lenses.cjs.

Native plan (from the brief): hold = TouchStart/TouchEnd on PlayArea; balloon
= one Screen Image the controller scales; HUD/panels identical to the existing
scenes. S7 owns the hold-vs-Snapchat-long-press device gate, with a documented
tap-pump fallback (each tap = one pump stroke).
