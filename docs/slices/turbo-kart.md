# Turbo Kart — 8-slice update plan (2026-10-08)

Status today: **S1–S3 landed in one build round.** A TuxKart-inspired
pseudo-3D kart racer: auto-throttle, hold/tap steering, centrifugal curve
pull, banana spin-outs, ⚡ boost boxes, quarter-lap checkpoints that buy
time, lap bonuses. 6th landing card, 6th browser-suite block, 25 core
fixtures + 2 meta fixtures. Native: no scene exists yet — S6 follows the
documented MCP recipe. Nothing here is native- or device-validated until
S7's gates.

| Slice | Name | One-line goal | Effort | Status |
|---|---|---|---|---|
| S1 | Core Rules | `games/turbo-kart/` deterministic core: throttle/steer/curves/grass/banana/boost/checkpoint/lap/expiry | L | ✅ 2026-10-08 |
| S2 | Browser Playable | Pseudo-3D renderer, tap/hold/keyboard steering, sfx, HUD, pause/replay/share, daily seed, QA hook | L | ✅ 2026-10-08 |
| S3 | Landing & Suite Integration | 6th card (5→6), browser-suite block, build registration, all green | M | ✅ 2026-10-08 |
| S4 | Variety | Rival karts to overtake (points), drift mechanic (release-while-turning), item boxes v2 (shield) | M | — |
| S5 | Meta & Retention | 7-day best chart on recap, streaks, risk-profile stats ("early braker %"), share text upgrade | M | — |
| S6 | Native Parity | Controller generation + `lens-projects/turbo-kart-lens/` via MCP, hold-to-steer vs tap-pulse mapping, preview clean | L | — |
| S7 | Device Validation | Steering vs Snapchat swipe gestures is the headline gate; safe areas; 60fps with full draw distance | L | — |
| S8 | Submission-Ready | Icon, preview shot list, Snapcode, final QA ladder, version tag | S | — |

---

## S1 — Core Rules (done)

- Track: seeded procedural loop (~1600 segments; curves enter/hold/exit eased,
  sine-ish hills, seamless wrap with height re-leveled and a finishing
  straight). Length trimmed to divide by 4 so the quarter-lap checkpoints
  always land on drawn banners, 4th award = start arch.
- First 100 segments object-free (calm launch, family grace parity).
- Physics: auto-throttle to `MAX_SPEED`, boost raises the cap (`BOOST_MAX`)
  with decay-back, grass caps at `OFFROAD_LIMIT`, centrifugal
  `dt·2·speedPct²·curve·k`, steering scales with speed and needs motion.
- Banana: spin 1.05s, speed clamped to 1800, boost canceled, control frozen,
  no double-penalty mid-spin. Boost: 2.2s, +150 pts.
- Checkpoints: odo-marching award (+9s, +250, cap 45s); lap wrap +500.
- 25 fixtures incl. determinism replay, loop-closure, purity scan.

## S2 — Browser Playable (done)

- OutRun-style segment projection, hill clipping, rumble/lane stripes,
  parallax ridges driven by accumulated curve, checkered checkpoint arches,
  canvas-drawn penguin kart (steer lean, spin rotation, boost flames, speed
  lines), procedural sfx, reduced-motion gated.
- Input: hold either half; quick taps leave a 280ms steering pulse; drag
  across the midline switches; ←/→/A/D; P pause; M mute.
- HUD chips Score/Best/Time/Lap/⚡; time pulses ≤5s. Recap: distance, top
  speed (km/h), checkpoints, laps, bananas, boosts, new-best.
- `?qa=1` hook exposes `getState/start/setInput/pause/resume/forceOver/game`.

## S3 — Landing & Suite Integration (done)

- Landing card 6/6 with `.kart` accent (#ffb03f) + hover zoom animation;
  meta description updated to six games.
- `scripts/build.cjs` registry extended; `package.json` globs pick the new
  tests up automatically (verified).
- Browser suite: landing `.game` count 5→6 across all four viewports + a
  Turbo Kart block (tap steer, throttle, boost box, banana spin, clock
  expiry, replay reset) in the same shape as the other per-game blocks.

## S4 — Variety (planned)

Rival karts as overtake targets (deterministic ghost lanes; +overtake
points), drift = release steer mid-curve for a mini-boost, item box v2 with
a shield charge (absorbs one banana). Keep the rng contract: all rolls via
injected rng, fixtures at tier edges, no specials changes in the final 2s.

## S5 — Meta & Retention (planned)

History ring already ships (`meta.js`); render the 7-day chart on the recap,
add day-streak, "checkpoints missed" risk stat, and share text upgrade.
Local-only.

## S6 — Native Parity (planned)

Extend `scripts/build-lenses.cjs` registry + adapter with a steer input
mapping: PlayArea split halves (TouchStart x < 0.5 = left) with the tap-pulse
behavior mirrored natively; road rendered via pooled Screen Images or a
custom Canvas-like approach — decide after a Studio spike. Exit bar:
preview logs clean, controller embeds core verbatim
(`tests/native-adapter.test.cjs` extended).

## S7 — Device Validation (planned, USER GATES)

Steering may fight Snapchat's own swipe/recording gestures — headline risk.
Also: safe areas vs capture button, interruption pause/resume, 60fps with
DRAW_DISTANCE 95, persistentStorageSystem best. Record pass/fail honestly.

## S8 — Submission-Ready (planned, USER GATES)

Icon, preview video shot list (launch → curve drift → banana → boost →
checkpoint banner → recap), Snapcode + links post-approval, version tag.
Submission stays the user's manual step.
