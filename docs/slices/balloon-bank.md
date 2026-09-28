# Balloon Bank — 8-slice update plan (2026-09-27)

Status today: **designed, not built.** `docs/brief-balloon-bank.md` is the
durable spec. Nothing exists in `games/` yet and the landing page currently
ships 4 games (the original three + Donut Dash, commit `2b4626a`) — Slice S1
creates the folder, S3 wires the landing page and suite from 4→5 cards.
Native: no scene exists; S6 assembles `lens-projects/balloon-bank-lens/` with
the same MCP recipe used for `snack-catch-lens` and `stack-rush-lens`
(documented in `docs/SNAPCHAT-HANDOFF.md`, status 2026-09-26). Nothing here is
native- or device-validated until S7's gates.

| Slice | Name | One-line goal | Effort |
|---|---|---|---|
| S1 | Scaffold & Core Rules | `games/balloon-bank/` with tested deterministic core: grow/leak/pop/bank/chain/round expiry | L |
| S2 | Browser Playable | Full browser game: hold input, wobble/creak/pop/bank juice, HUD, pause/replay/share, QA hook | L |
| S3 | Landing & Suite Integration | 5th game card on the landing page (4→5), browser-test suite extended, all green | M |
| S4 | Variety & Economy | Golden / quick-leak / heart-refill balloons + chain multiplier tuning, weighted spawns, tests | M |
| S5 | Meta & Retention | Risk-profile stats, 7-day best chart, daily seeded challenge, share text upgrade — local-only | M |
| S6 | Native Parity | Controller generation + `lens-projects/balloon-bank-lens/` scene assembly via MCP, preview clean | L |
| S7 | Device Validation | Hold-vs-Snapchat long-press conflict is the headline gate; tap-pump fallback verified; safe areas | L |
| S8 | Submission-Ready | Icon, preview video shot list, Snapcode, final QA ladder, version tag | S |

---

## S1 — Scaffold & Core Rules (L)

**Goal:** `games/balloon-bank/` exists with the real rules implemented test-first
and green under the existing `npm test` glob (auto-discovers
`games/*/core.test.cjs` — verify once, no `package.json` edit expected).

**Files changed:** `games/balloon-bank/core.js`, `core.test.cjs`,
`README.md`, `lens/SETUP.md` (stub pointing at `native/README.md`), `docs/brief-balloon-bank.md` (status flip).

**Implementation steps**
1. TDD the core contract: start/reset, hold→grow at `PUMP_RATE`, idle leak at
   `LEAK_RATE`, pop at threshold (heart loss + chain reset), bank (quadratic
   points × chain multiplier), 30s expiry, 0-hearts end, replay clean.
2. Warning contract fixture: with rng pinned, assert creak state engages
   ≥ 250 ms before earliest pop (`radius/T` crossing vs `PUMP_RATE`).
3. Determinism: two games with the same seed produce identical runs given the
   same input script; injected rng only, ES5 UMD, no Date/DOM.
4. Snapshot fields for QA: `radius`, `threshold` (test/QA only), `score`,
   `hearts`, `chain`, `timeLeft`, `banks`, `pops`.

**Acceptance:** `node --test games/balloon-bank/core.test.cjs` green; `npm
test` still green repo-wide; `node --check` clean.

**Native impact:** none yet (core feeds the S6 generator verbatim).

## S2 — Browser Playable (L)

**Goal:** a complete, juicy browser game in `games/balloon-bank/`, sibling-quality
with Snack Catch.

**Files changed:** `games/balloon-bank/index.html`, `style.css`, `app.js`,
`README.md`.

**Implementation steps**
1. Hold-anywhere pointer input + hold-Space; pointer-to-canvas mapping with
   DPR cap 1.5; input cannot start the game from control buttons (family guard).
2. Render: balloon with wobble amplitude tied to `radius/T`, pump-pad, floating
   bank-score popups, pop burst particles + screen shake (reduced-motion:
   static wobble, no shake), leak drips.
3. Audio: pump tick rising with radius, creak warning, pop burst, bank chime;
   mute persisted at `balloon-bank-muted`; unlock on first gesture.
4. HUD (score/best/time/hearts/chain), pause/resume/visibility pause, replay,
   share with copy fallback, guarded `balloon-bank-best`.
5. QA hook `window.__gameTest` under `?qa=1` exposing `getState`, `start`,
   `hold(bool)`, `pause`, `resume`, `replay`.

**Acceptance:** manual browser play at 360x640 and 390x844; `node --check`;
unit suite untouched and green.

**Native impact:** none; UI mirrors what S6 maps to Screen Images/Texts.

## S3 — Landing & Suite Integration (M)

**Goal:** Balloon Bank becomes the 4th playable card and the whole suite proves it.

**Files changed:** `index.html`, `landing.css`, `landing.js`,
`scripts/browser-test.cjs`, `docs/SNAPCHAT-HANDOFF.md` (status line).

**Implementation steps**
1. Landing card (sky accent `#7ddcff`) with hero + one-line rule; keyboard/touch
   parity with the other three cards.
2. Extend `scripts/browser-test.cjs`: landing assertions 3→4 games; add a
   Balloon Bank block in the same shape as the existing per-game blocks (start
   gate, pause freeze/resume, mute no-op on score, visibility pause, QA hook
   absent in normal mode, playable-viewport checks, best persistence) using
   the S2 QA hook — drive a real held bank + a real pop via the hook.
3. Update any count-based checks (`.game` count === 4) and the artifacts list.

**Acceptance:** full `npm run test:browser` green including the new block;
landing responsive checks pass at all four sizes.

**Native impact:** none (S6 covers native).

## S4 — Variety & Economy (M)

**Goal:** the special balloons and chain economy make risk-taking interesting.

**Files changed:** `games/balloon-bank/core.js`, `core.test.cjs`, `app.js` (HUD chips).

**Implementation steps**
1. Golden balloon (10% spawn from 3rd bank onward): 3x bank value, threshold
   window narrowed ~20%; quick-leak (15%): `LEAK_RATE` ×3; heart refill (rare,
   only when `hearts < 3`, banking at ≥ 80% radius restores a heart, never
   spawns above 1 per round unless hurt again).
2. Chain multipliers x2 at chain 3, x3 at chain 6 (pop resets) — multiplier
   applied at bank time, fixture-tested at tier edges.
3. Spawn weights + cooldowns deterministic via injected rng; per-type HUD
   chips; no specials in the final 2s (family rule parity).

**Acceptance:** new fixtures for each type + weights + final-2s guard; `npm
test` green; browser sanity via QA hook.

**Native impact:** controller regenerates (S6 flow) since core changed.

## S5 — Meta & Retention (M)

**Goal:** local-only reason to come back tomorrow.

**Files changed:** `games/balloon-bank/app.js`, `index.html` (recap block).

**Implementation steps**
1. Risk-profile stats on the recap: average banked size %, biggest single bank,
   pops, best chain, "you banked early X% of the time".
2. Last-7-days best history (guarded `localStorage` ring) rendered as a tiny
   inline SVG chart; daily challenge = date-derived seed (core stays Date-free:
   seed string passed in from the app).
3. Share text with score + biggest bank; "new personal best" delta vs previous.

**Acceptance:** unit-testable pieces (seed derivation, ring buffer) get
fixtures; browser check asserts history persists across reload (same shape as
the siblings' best-persistence check).

**Native impact:** none.

## S6 — Native Parity (L)

**Goal:** `lens-projects/balloon-bank-lens/` assembled and preview-clean, same
bar as the other three.

**Files changed:** `scripts/build-lenses.cjs` (add `balloon-bank` to the
GAME_ID registry), `games/balloon-bank/lens/GameController.js` (generated),
`lens/SETUP.md`, `native/README.md` (game-specific section), new
`lens-projects/balloon-bank-lens/`.

**Implementation steps**
1. Extend the generator registry; generated controller embeds the core
   verbatim (`tests/native-adapter.test.cjs` pattern extended to cover it).
2. MCP scene assembly following the documented recipe: GameCamera/GameCanvas/
   PlayArea ±0.90/±0.70, Score/Time/Message texts, PauseButton,
   Start/Over/Pause panels, `Balloon` Screen Image + `PumpPad` anchor object;
   hold = `TouchStart`/`TouchEnd` on PlayArea.
3. Wire every `@input` (including the tap-pump fallback toggle input), import
   the generated controller, save to `lens-projects/balloon-bank-lens/`,
   `RunAndCollectLogsTool` refresh → **no script errors** is the exit bar.
4. Assign a sky-tinted material to the balloon (avoid shipping the white
   placeholder the first three launched with).

**Acceptance:** generator test green; preview logs clean; handoff doc status
section updated honestly (assembled ≠ device-validated).

**Native impact:** this slice *is* the native bring-up.

## S7 — Device Validation (L)

**Goal:** prove or kill the hold mechanic on real Snapchat hardware — the
biggest open risk in the whole collection.

**Implementation steps / gates (exit criteria, NOT claims)**
1. Pair phone; sustained 3-5s hold does **not** trigger Snapchat long-press
   behaviors (record/copy UI) — if it does, enable the tap-pump fallback input
   and re-verify playability.
2. Safe areas with PlayArea anchors ±0.90/±0.70 tuned against real chrome;
   capture button unobstructed; interruption (notification/camera switch)
   pauses and resumes cleanly; `persistentStorageSystem` best survives restart.
3. Performance: 60fps-equivalent with balloon at max radius + particles;
   front and back camera.
4. Record results + artifacts in `docs/SNAPCHAT-HANDOFF.md` per checklist
   items 4–6.

**Acceptance:** every gate has a recorded pass/fail; failures loop back into
S6 fixes, never silently skipped.

## S8 — Submission-Ready (S)

**Goal:** the fourth Snapcode-ready package.

**Implementation steps**
1. Original 1024px lens icon (balloon + pad, family style); GenerateLensIcon
   flow available in Studio, final art user-approved.
2. 10-20s vertical preview video shot list: pump-up tension → near-pop creak →
   bank chime chain → golden balloon → pop → recap; capture via Studio preview.
3. Snapcode + links recorded in docs post-approval; final QA ladder
   `npm ci → npm test → npm run build → npm run test:browser`; version tag.
4. Submission itself remains the user's manual step via their Snap account;
   approval timing is Snap's — never claimed by this repo.
