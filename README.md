# Pocket Party

Four quick, portrait-first games designed as Snapchat Lens game concepts, with playable browser previews and Lens Studio JavaScript adapters.

## Play locally

Requires Node.js 20+ and Python 3.

    npm ci
    npm test
    npm run build
    npm start

Open http://127.0.0.1:4173. No account, backend, tracking or external game assets are required. Best scores are stored only in your browser on this device. Web sharing uses the operating system share sheet where available, with copy/text fallback.

## Games

- Snack Catch: drag the basket (or arrows/A/D), catch snacks, dodge bombs. A 30-second score attack.
- Stack Rush: tap or press Space to drop a block. Preserve overlap; perfect drops earn bonuses. One missed stack ends the run.
- Color Panic: match the target's ink color and symbol, not the word. Tap a colored button or press 1–4. A 30-second reaction game.
- Donut Dash: an infinite side-scroller. Tap or press Space to jump (twice for a double jump), clear the crates, grab snacks. Three crashes end the run.

## Snapchat status — important

These browser games are NOT published Snapchat Lenses. A website cannot simply be uploaded as a Lens. This repository includes reusable deterministic game cores, JavaScript Lens controllers and scene-wiring instructions under each game's `lens/` folder. Lens Studio is not installed on the build machine, so native compilation, scene assembly, device testing and publication are NOT verified. No `.lsproj` is fabricated, and no Snapcode exists yet.

Open the relevant `games/<slug>/lens/SETUP.md` to assemble the native scene in Lens Studio. See `docs/SNAPCHAT-HANDOFF.md` for the release checklist.

## Development and verification

    npm test
    npx playwright install chromium
    npm run test:browser

The browser suite expects the site on localhost:4173 unless BASE_URL is supplied. Its screenshots and JSON report are saved under artifacts/. All game core tests use Node's built-in test runner. No runtime dependencies. The static build explicitly copies only public game assets, not source briefs, logs or test files.

`docs/PLAN.md` and `docs/brief-*.md` contain game specifications and worker ownership. Three separate GLM 5.3 Flash worker processes implement one game each. `docs/deadline.json` records the hard stop; `docs/run_worker.py` bounds worker execution. No recurring jobs are installed.

## Layout

    index.html / landing.css / landing.js  — arcade launcher
    games/<slug>/core.js                   — tested deterministic rules
    games/<slug>/app.js                    — browser input, rendering and audio
    games/<slug>/core.test.cjs             — real rules tests
    games/<slug>/lens/                     — native scripts and setup guide
    scripts/                              — build and browser verification

Not affiliated with or endorsed by Snap Inc. Native publishing remains subject to Snap's account requirements, content rules and review process.
