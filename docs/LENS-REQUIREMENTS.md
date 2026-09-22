# Snapchat Lens Submission Requirements — pocket-party (3 game Lenses)

Compiled 2026-09-21 from Snap's live docs (fetched via curl). Scope: submit snack-catch, stack-rush, color-panic as three separate Game Lenses via Lens Studio 5.x.

Primary sources, cited throughout as:
- [SG] Submission Guidelines — https://developers.snap.com/lens-studio/publishing/submitting/submission-guidelines
- [GO] Building Games on Snapchat — https://developers.snap.com/lens-studio/features/games/games-overview
- [BP] Best Practices for Games — https://developers.snap.com/lens-studio/features/games/best-practices
- [SYL] Submitting Your Lens — https://developers.snap.com/lens-studio/publishing/submitting/submitting-your-lens
- [CPI] Configuring Project Settings — https://developers.snap.com/lens-studio/publishing/configuring/configuring-project-info
- [PERF] Performance and Optimization — https://developers.snap.com/lens-studio/publishing/optimization/performance-optimization-guide
- [PV] Preview Videos — https://developers.snap.com/lens-studio/publishing/configuring/creating-a-preview-video
- [LCR] Lens Creator Rewards — https://ar.snap.com/lens-creator-rewards

---

## 1. Hard technical requirements

### 1.1 Size and resource budgets
| Requirement | Limit | Source |
|---|---|---|
| Exported (zipped) Lens size | 8 MB max | [SG], [CPI] |
| Advised size for fast download | ≤ 2 MB ("we advise staying at 2 mb or less") | [CPI] |
| SnapML models | +10 MB separate budget (N/A for us) | [SG], [CPI] |
| RAM while running in Snapchat | 150 MB max | [SG], [PERF] |
| Any single texture | ≤ 2048x2048 | [SG], [PERF] |
| Screen-space 2D textures | ≤ 720x1280 (Snapchat max output) | [PERF] |
| Meshes | ≤ 100k tris (60k if skinned) — N/A, we are 2D | [SG] |
| Sponsored Lenses | < 4 MB (N/A unless sponsored) | [CPI] |

Our 128x128 transparent PNGs are far below all texture limits. PNG is fine because we need alpha; opaque UI can be JPG or constant-color materials to save space ([PERF] Texture Transparency).

### 1.2 Performance budgets / device matrix
| Requirement | Value | Source |
|---|---|---|
| Frame rate (hard floor, iPhone 6+) | 27 FPS or higher | [SG] |
| Frame rate (hard floor, Galaxy S6+ Android) | 15 FPS or higher | [SG] |
| Target FPS | 30 FPS across devices globally; never below 15 on most devices | [BP], [PERF] |
| Device matrix (automated testing) | iOS and Android device array; performance, compatibility, memory checked per device | [SYL] |
| Lens Activation Time | Not gated for community Lenses; < 650 ms required for ad campaigns | [PERF] |

Game-specific (from Games docs):
- Fullscreen Mode: Game Lenses auto-enter fullscreen on first tap; blocks default touch behavior (prevents swipe-out). "May not be available on all devices." [BP]
- Touch input: use Touch Blocking (`global.touchSystem.touchBlocking`) so taps/swipes don't exit the Lens mid-play. [BP]; adapter grounding: https://developers.snap.com/lens-studio/features/scripting/touch-input
- Screen orientation: portrait; design within the 720x1280 screen budget and keep UI inside screen-safe area (Snapchat chrome overlaps edges — our PlayArea anchors at ±0.90 x / ±0.70 y reserve margins; verify on device, this is not an official safe-area spec).
- No official "minimum frame rate" beyond the 27/15 FPS floors above; the 30 FPS target is a best practice, not a gate. [BP], [PERF]
- Scripting: prefer event-driven logic over per-frame Update. [PERF]

### 1.3 Icon and preview specs
- Lens name: ≤ 18 characters, letters/numbers/spaces only. [CPI]
- Lens icon: packaged with Lens; recommended size 320x320 px; import or GenAI-generate; original imagery required — default Lens Studio icons are a listed quality failure. [PERF], [CPI], [SYL]
- Lens preview: a video packaged with the Lens, shown in Lens Explorer. [CPI]
- Preview video: 9:16 vertical, under 32 MB, .mp4 recommended (h264); keep short, first frame compelling (it may be shown as a static image); Submission Guidelines apply to the preview video too. [PV]
- One preview per Lens; adding one in My Lenses replaces the Project Info one. [PV]
- Add a Lens Hint describing how to play (helps quality/distribution). [SYL], [CPI]

### 1.4 Game-specific requirements summary (games docs)
- Touch: tap/swipe mechanics should be "lightweight and responsive"; block default touch. [BP]
- Fullscreen mode is exclusive to Game Lenses. [BP]
- Optional social scaffolding (not required to publish): Leaderboard Component, Turn Based, Multiplayer (Connected Framework), Bitmoji; templates for Multiplayer/Leaderboard/Turn Based/Platformer exist on the Lens Studio home screen. [GO]
- Spotlight engagement: camera-on or picture-in-picture (~30% widget) backgrounds drive more posts; fully-designed opaque backgrounds are explicitly allowed ("not a requirement"). [BP] — Our opaque dark PlayArea background is compliant; a camera toggle or PiP is a post-v1 enhancement.

---

## 2. Submission flow checklist

Flow per [SYL]:

Pre-submission
- [ ] Project Settings complete: Lens Name (≤18 chars), Lens Icon (320x320, original), Lens Preview video, Platform = Mobile, Discoverability tags. [CPI]
- [ ] Lens passes local validation checks shown in Project Settings window. [CPI]
- [ ] Size < 8 MB (aim ≤ 2 MB), no per-frame scripts, textures compressed (Performance compression). [CPI], [PERF]
- [ ] On-device test via Pair to Snapchat: check LAT/FPS/RAM/SIZE in the gear overlay; test on at least one low-end Android. [PERF]
- [ ] Click Publish (top right) → log into Snapchat → authorize Lens Studio. [SYL]
- [ ] Set up / select Organization and Lens Folder (folder is mandatory; My Lenses users get one auto-created). [SYL]
- [ ] Choose "Submit as new Lens" (our case) vs "Update existing". [SYL]
- [ ] Lens details: add Tags (relevant only; irrelevant tags are moderated), optional Scan Triggers. [SYL]
- [ ] "Upload to Lens Folder" = draft/not published. "Upload and Publish" = goes live on your profile; set Visibility (Live/Offline) — changeable later. [SYL]
- [ ] Submit Lens.

Review stages ([SYL], "Lens Submission Error Reporting"):
1. Validation — metadata/package checks (e.g., package version).
2. Automated Testing — bulk of testing: performance, device compatibility, memory across iOS+Android array.
3. Content Review — Community Guidelines review of assets/attachments.

Statuses: In Review → Live; Invalid (technical failure, one or more reasons shown; fix + resubmit; previous live version stays active if only the update is invalid); Rejected (policy, cannot be unlocked, can fix and resubmit); Offline (manual). [SYL]

Typical failure reasons:
- Size > 8 MB; RAM > 150 MB; FPS below floors. [SG], [SYL "Invalid"]
- Default/stock Lens Studio icon, missing/copycat preview, ML or viral Lens copies, QR codes, growth hacks ("Follow for more"), "Subscribe to me" text. [SYL quality tips], [SG Creative Quality]
- Content Guideline violations (violence, hate, IP infringement incl. unlicensed music). [SG]
- Experimental API enabled blocks publishing. [CPI]
- Failure stage is shown in My Lenses with Error Logs. [SYL]

Per-Lens (x3): repeat the whole flow per game; each game is its own project, name, icon, preview, and Lens ID. Keep the three in one Organization/Folder for management. [SYL]

---

## 3. Monetization (Lens Creator Rewards / Lens+ Payouts)

From [LCR] (https://ar.snap.com/lens-creator-rewards) and [GO]:

- Two programs, mutually exclusive per Lens: a Lens can be enrolled in Top Performer Payouts OR Lens+ Payouts, never both at once. [LCR FAQ]
- Top Performer Payouts: open to all eligible creators; Lens qualifies after 15,000 Qualified Posters (unique users in qualified Regions posting a Snap with the Lens to Spotlight/Stories) in its first 90 days. [LCR], [GO]
- Lens+ Payouts: opt-in by application; only approved creators; mark Lenses as Exclusive; rewards based on engagement from Lens+ / Snapchat Platinum subscribers. [LCR], https://ar.snap.com/blog/monetizing-with-snap
- Eligibility: creator 18+, eligible country, Lens made in Lens Studio. [LCR FAQ]
- Non-qualifying content for Top Performer payouts: simple color filters, basic beautification, static 2D images with limited interactivity, frames/collages, easily-repeatable/copied Lenses. [LCR FAQ] — Our games are interactive and original, so they fit the intended category; games are noted as "some of our most rewarded Lenses." [GO]
- Action for us: nothing required at submission. After a game is Live and showing engagement, apply for Lens+ Payouts (Exclusive route) or let it run for Top Performer qualification. Do not mark v1 Exclusive before baseline engagement data exists.

---

## 4. SEPARATION PLAN — one Lens project per game

Common to all three (per native/README.md scene setup):
- New Lens Studio project per game. Scene: orthographic screen hierarchy; `PlayArea` Screen Image parent, anchors left -0.90 / right 0.90 / top 0.70 / bottom -0.70, offsets 0; dark opaque background material; all gameplay objects are direct children of PlayArea.
- Import `games/<slug>/lens/GameController.js` (generated by `node scripts/build-lenses.cjs`, embeds core.js verbatim — never hand-copy) as a JS asset on a separate scene object; assign `playArea` = PlayArea's ScreenTransform.
- Shared overlays under PlayArea: Screen Text Score (0, 0.88), Timer (0, 0.73), Message (0, 0.48); Pause button (0.82, 0.90, 0.28x0.18, ≥44 px hit); StartPanel / OverPanel / PausePanel covering PlayArea (-1..1 local).
- All touch goes through `playArea.screenPointToLocalPoint` (ScreenTransform anchors are -1..1, NOT 0..1). Score persists via `global.persistentStorageSystem.store` (guarded). Touch Blocking on for gameplay.
- NOT ported from web app.js (verified DOM/canvas/audio leftovers by scan): document.* / getElementById (24/1/21 refs), window.*, canvas refs (4/14/12), `new Image()` sprite loading, Audio/sfx (2/17/2 refs — stack-rush is the loudest), requestAnimationFrame loop (controller uses Update events), localStorage best-score (replaced by Persistent Storage), textContent writes (replaced by Text components). app.js stays untouched — the Lens builds only from core.js + adapter + GameController.
- Estimated lens size, all three: controllers 6-17 KB each, PNGs 1.4-7.8 KB each, scripts+materials+icon well under 1 MB of binary — estimate 200-600 KB per Lens, far under both the 8 MB cap and the 2 MB advisement. Risk is object count, not size ([PERF] RAM/object count): keep pool sizes as specified.

### 4.1 snack-catch
- Template fit: no games template needed — plain 2D Screen Image project (the "Base" template). A Leaderboard template variant is the natural v2 upgrade. [GO templates]
- Scene objects: PlayArea; Basket (mint Screen Image, controller-driven transform); ItemPool = 24 Screen Text children (mint ● snacks, red ✹ bombs; font must cover both glyphs); Score/Timer/Message; Pause; Start/Over/Pause panels.
- Drag input: `screenPointToLocalPoint` horizontal drag → `setInputX`.
- assets/native used (6): apple.png, banana.png, cookie.png, donut.png, basket.png, bomb.png. (Native v1 uses text placeholders; PNGs are the replacement art and do not change collision rules.)
- Strip from web app.js: canvas sprite atlas draw, `new Image()` loading of the 6 sprites, touch/mouse drag handlers, Audio miss/catch sfx, rAF loop, localStorage best.
- Port order: 1) build GameController (`scripts/build-lenses.cjs`) → 2) new project, PlayArea + panels → 3) import controller, wire inputs → 4) ItemPool texts → 5) replace text placeholders with the 6 PNGs → 6) pair device, verify 30 FPS + touch blocking → 7) icon/preview/tags → submit.

### 4.2 stack-rush
- Template fit: closest to the Platformer/arcade sample style, but our implementation is pure tap-timing — plain 2D project; Leaderboard template variant for v2 (score-chasing genre is the Leaderboard doc's named use case). [GO]
- Scene objects: PlayArea; MovingBlock (yellow Screen Image, white texture); LayerPool = 24 Screen Images (warm gold/coral materials; code-driven size/position, offsets 0); Score/Timer/Message; Pause; panels. Touch anywhere on PlayArea = drop. Native omits browser particle/debris FX (rules identical — embedded core).
- assets/native used (0 required): blocks are material-colored Screen Images. Optional polish: reuse blue-square/green-circle/red-triangle/yellow-diamond.png as block textures; not needed for v1.
- Strip from web app.js: heaviest of the three — canvas rendering of tower/layers, 17 Audio refs (drop/perfect/miss/game-over sfx), debris particle system, rAF loop, localStorage best, keyboard (space) handler (Lens is tap-only).
- Port order: same as 4.1; extra step: verify LayerPool mapping with >10 layers (pool exhaustion → game-over edge case) on device before submit.

### 4.3 color-panic
- Template fit: plain 2D project; Turn Based format is a strong v2 fit (async two-player "react faster" rounds over Snaps). [GO]
- Scene objects: PlayArea; TargetText (0, 0.35, 1.6x0.35 — word + ink color); TargetSymbol (0, 0.08, 0.5x0.3 — non-color cue); four choice groups 2x2 at (-0.48,-0.34), (0.48,-0.34), (-0.48,-0.72), (0.48,-0.72), each 0.86x0.28, dark Screen Image + centered Text; Score/Timer/Message; Pause; panels. Hit-testing uses each choice's real ScreenTransform (`containsScreenPoint`), ≥44 px.
- assets/native used (4): red-triangle.png, green-circle.png, blue-square.png, yellow-diamond.png (choice icons / fallback cues; no basket).
- Strip from web app.js: canvas grid rendering, `new Image()` for the 4 shape sprites, click handlers per quadrant (native reads ScreenTransforms), Audio tick sfx, rAF loop, localStorage best.
- Port order: same common order; extra step: verify hit regions on smallest test phone (four 0.86x0.28 zones in PlayArea space) before submit.

### 4.4 Submit FIRST: color-panic (lowest risk)
Reasoning:
- Fewest moving parts per event: one tap, no continuous drag, no per-frame collision (snack-catch) and no 24-object pool with overflow edge cases (stack-rush).
- Deterministic hit-testing against four ScreenTransforms; failure modes are local and easy to reproduce.
- No bomb imagery at all; zero content-review surface beyond generic competitive wording.
- Smallest asset set (4 PNGs), ~9 KB core.
Then snack-catch second (drag input + bomb sprite = two review/testing risks, still small), stack-rush last (largest core, biggest audio/particle strip-out, pool-edge cases).

---

## 5. Policy risks and mitigations

1. bomb.png in snack-catch — LOW risk. [SG] prohibits realistic weapons/weaponized explosives and "implied harm"; explicitly allows "fictional, cartoonish" imagery. Our bomb is a 128x128 cartoon red starburst ✹ used as a avoid-object, drawn in text fallback as ✹ — no explosion, no harm to people. Mitigation: keep the cartoon starburst styling (no realistic fuse/blast imagery), no explosion sound/visual, copy says "avoid bombs" not "destroy". If content review flags it, swap to a "rock"/"junk" reskin of the same sprite slot — no core change.
2. Competitive/social wording — LOW-MEDIUM. [SG] Harassment/Targeted Distribution bans Lenses that "lead to social comparison or describe and depict friends in negative ways"; [SYL] bans growth hacks ("Share with 10 Friends", "Follow for more") and "Subscribe to me" text. Mitigation: score copy stays self-referential ("Best: 12", "Tap to retry") — no friend-ranking shaming in v1 (no Leaderboard yet anyway); never add share-bait copy; no QR codes anywhere (panels, icon, preview video).
3. Opaque background hides camera — NOT a policy risk, only engagement. [BP] explicitly allows fully-designed backgrounds; camera-on/PiP is optional for Spotlight performance. Optional v2: camera-toggle button.
4. "Panic"/"Rush" naming — negligible; not threatening language under [SG]. Keep names ≤18 chars for Project Info: "Snack Catch" (11), "Stack Rush" (10), "Color Panic" (11). [CPI]
5. IP — all art is original in-repo PNGs; no music/audio in v1 Lenses (all browser audio stripped), which removes the music-rights risk entirely ([SG] IP section). Keep it that way until we license or compose audio.
6. Default icon/preview — must not ship Lens Studio stock icon or skip the preview; both are listed quality/distribution failures. [SYL], [CPI]
7. Experimental APIs — controller uses only stable APIs (ScreenTransform, TouchComponent events, persistent storage); leave Experimental API off or publishing is blocked. [CPI]

---

## Quick reference: hard gates before hitting Submit (each Lens)
- [ ] ≤ 8 MB (target ≤ 2 MB), < 150 MB RAM on device, ≥ 27 FPS iOS / ≥ 15 FPS Android measured (target 30)
- [ ] Original 320x320 icon, 9:16 <32 MB mp4 preview, name ≤ 18 chars, Lens Hint set
- [ ] Touch Blocking active; fullscreen entered on tap; ≥44 px hit areas verified on device
- [ ] No DOM/audio/localStorage leftovers (GameController only talks ScreenTransform/Persistent Storage)
- [ ] Organization + Lens Folder selected; new-Lens submit; visibility Live
