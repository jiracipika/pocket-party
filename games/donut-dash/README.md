# Donut Dash — Pocket Party

Portrait-first infinite side-scroller: a donut auto-runs right forever; tap to
jump (and double jump), clear the crates, grab the snacks. Three crashes end
the run. Zero runtime dependencies — vanilla JS + canvas.

## Play

Open `games/donut-dash/index.html` in any browser (or serve the `pocket-party`
folder statically). Works from 360x640 up to desktop.

## Controls

| Action | Touch / Mouse | Keyboard |
|---|---|---|
| Jump / double jump | Tap anywhere on the canvas | Space, Arrow Up or W |
| Start / Replay | Start Game / Run Again button | Space, Enter |
| Pause / Resume | Pause button or Resume button | P or Esc |
| Mute | Speaker button (top right) | — |
| Home | "<- Home" link (top left) | `../../index.html` |

The game auto-pauses when the tab is hidden (`visibilitychange`). Pointer taps
are mapped through the canvas bounding rect. DPR scaling is capped at 1.5.

## Mechanics

- Endless run: speed starts at 240 px/s, gains +6 px/s each second, capped at
  520 px/s. Score comes from distance (1 pt per 12 px) plus pickups.
- Jump from the ground; one extra mid-air jump per airborne period. The jump
  budget resets on landing.
- Crates come in four shapes: crate (42x46), tall (38x78, well-timed jump),
  wide (80x44, jump early) and double (two crates 92 px apart — chain jumps).
  Tall/double shapes only appear after 10s/18s of a run.
- Obstacle groups are always separated by at least ~1.05s of run time, so a
  land-then-rejump is possible at every speed. This is a core invariant with
  a dedicated unit test.
- Snack pickups (apple, cookie, banana, donut) spawn in arcs of three in the
  gaps: **+25 each**. Pickups never damage.
- Crashing into a crate costs **1 heart** (3 total) and grants 1.2s of mercy
  i-frames; the crashed crate is marked and cannot hit twice. 0 hearts ends
  the run.
- Local best score via `localStorage`, guarded with try/catch (private mode
  safe). Game-over recap: distance, snacks, crashes, jumps, new-best flag.
- Share via `navigator.share` with clipboard-copy and prompt fallback. No
  leaderboard — your best score is local only.
