# Snapchat native handoff

## What is actually delivered

Playable browser versions and native Lens Studio JavaScript adapters with explicit scene inputs. Not exported `.lsproj` projects, not Snapchat-published Lenses. Browser testing does not validate Lens runtime behavior.

## Official platform references checked

- Games overview: https://developers.snap.com/lens-studio/features/games/games-overview
- Touch input and blocking: https://developers.snap.com/lens-studio/features/scripting/touch-input
- Script overview: https://developers.snap.com/lens-studio/features/scripting/script-overview

The games overview identifies current games as Lenses built in Lens Studio, with optional Leaderboard, Turn Based and Bitmoji components. These starter games do not pretend to have those integrations. Personal bests are not friend leaderboards.

## Native acceptance checklist (not yet completed)

1. Install Lens Studio from Snap, create one project per game, and follow that game's `lens/SETUP.md` scene hierarchy and Inspector input wiring.
2. Import the generated native controller. Do not import HTML or browser `app.js` into Lens Studio.
3. Check that all required inputs are assigned. Match positions and hitboxes to the guide. Duplicate materials if setting per-object colors.
4. Preview: start, score, failure, game over, restart, pause/resume, and touch blocking. Inspect Lens Studio Logger for errors. Resize preview across phone aspect ratios.
5. Pair an actual phone running Snapchat. Verify top/bottom Snapchat UI safe areas, dragging/tapping, capture button accessibility, camera switching, interruptions and performance.
6. Verify sound, local storage, colorblind cues and game-over feedback on the device. Native adapters may use a simpler rendering/audio path than the browser versions; do not assume parity from web tests.
7. Optional later: add Snap's official Leaderboard component to submit actual scores. Do not fabricate friend rankings. Add social turn-based state only as a separate tested feature.
8. Add original lens icons, preview video and names, run Studio validation, then submit through your own Snap account. Review/approval timing is controlled by Snap, not this project.
9. After approval, save actual Lens links and Snapcodes here. Until then, share the website only as a browser preview.

## Cutoff

Worker calls are bounded by the recorded deadline and per-worker wall-clock limits. If any work remains at the cutoff, retain it locally and do not launch GLM again during 14:00–18:00 UTC+8. Resumption is manual; no recurring jobs were created.
