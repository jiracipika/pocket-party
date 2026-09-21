# Pocket Party Implementation Plan

> For Hermes: use subagent-driven-development with isolated game ownership and parent review.

Goal: three fun Snapchat-oriented mini-games, verified playable browser previews and reusable Lens Studio source.
Architecture: independent zero-dependency Canvas games, deterministic shared-per-game cores, browser adapters and native Lens adapters. Landing page routes to each. Native runtime/publishing requires Lens Studio and Snapchat account; do not describe web previews as native Lenses.
Tech: vanilla HTML/CSS/JS, node:test, Playwright, Lens Studio JavaScript.

Tasks (each worker follows test-first core -> browser -> native adapter -> verification):
1. Snack Catch: games/snack-catch/{core.js,core.test.cjs,index.html,app.js,style.css,lens/GameController.js,lens/SETUP.md,README.md}.
2. Stack Rush: same paths under games/stack-rush.
3. Color Panic: same paths under games/color-panic.
4. Parent builds index.html, shared landing assets, root package.json, static build script and README.
5. Parent runs node --test games/*/core.test.cjs, all JS syntax checks, real browser touch/keyboard/start/pause/replay and layout checks. Review spec before code quality. Correct failures, record evidence.
6. Create private repository, commit/push and deploy browser preview if authenticated. Verify exact public paths. Document native limitations and handoff.

Full game specs, edge cases, design constraints, commands and ownership are in docs/brief-*.md.
Deadline enforced by worker supervisor using docs/deadline.json; no automatic retries or GLM launches during 14:00–18:00 UTC+8 after cutoff. No work on automated-newsletter, pitchforge or pitch-therapy.
