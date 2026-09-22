Research task: Snapchat Lens submission requirements for GAMES, plus a separation plan for our 3 mini-games.

Context: repo /Volumes/HARD/projects/pocket-party — three portrait HTML5 canvas games (snack-catch, stack-rush, color-panic) with pure CommonJS core.js modules (UMD, no DOM deps, seeded RNG), native/adapter.js Lens Studio source adapter (ScreenTransform inputs, screenPointToLocalPoint touch mapping), assets/native/ has 10 transparent 128x128 PNGs for Lens import. Goal: submit each game as its own Lens via Lens Studio.

Deliver to docs/LENS-REQUIREMENTS.md (single file, no other file edits):
1. From https://developers.snap.com/lens-studio/publishing/submitting/submission-guidelines and https://developers.snap.com/lens-studio/features/games/games-overview (use webReader-style fetches via curl if needed; you have no browser): hard technical requirements — lens size limits, performance budgets, device matrix, icon/preview specs (sizes, formats), preview video recommendations, game-specific requirements (touch input, screen orientation, minimum frame rate).
2. Submission flow checklist: project info fields, organization/lens folder, visibility, review stages (validation/automated testing/content review) and typical failure reasons.
3. Monetization: Lens+ / payouts opt-in requirements.
4. SEPARATION PLAN: per game (snack-catch / stack-rush / color-panic) — which Lens Studio games template fits best, what scene objects are needed (ScreenTransform play area, Text score, touch zones), what must be stripped from our web app.js (DOM/canvas/audio leftovers), which assets/native PNGs each uses, estimated lens size, and a step order for porting. Recommend which game to submit FIRST (lowest risk).
5. Any policy risks in our games (bomb sprite in snack-catch? competitive wording?) with mitigation.

Rules: run immediately, minimal prose, cite doc URLs for every requirement. Do NOT touch automated-newsletter, pitchforge, or pitch-therapy. Do not modify games/, native/, assets/, or tests. Only create/edit docs/LENS-REQUIREMENTS.md.
