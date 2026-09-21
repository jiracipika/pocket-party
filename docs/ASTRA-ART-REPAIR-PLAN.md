# Astra art and repair implementation plan

> For Hermes: isolated GLM 5.3 Flash implementation lanes; Astra owns planning, original art assets and acceptance review.

Goal: deliver three fun, tested browser game previews plus explicitly unvalidated native Lens source, using actual illustrated gameplay sprites rather than just menu recolors.
Architecture: retain each tested deterministic core, integrate cached SVG images/patterns in browser rendering, generate all native controllers from a single adapter plus exact embedded cores. Native scene assembly remains a separate acceptance gate.
Tech: vanilla Canvas, node:test, Playwright, Lens Studio JS source; SVG sprites, PNG native assets, WebP concept crops.

## Art direction

Toy-box screen printing. Opaque inks, chunky outlines, subtle stipple, readable small silhouettes. Mint catcher, warm block tower, lilac Stroop game. Preserve all hitboxes and input geometry. The dark base keeps bright semantic colors legible. No bloom, blur, alpha-tinted scenery or fake social ranking.

Astra-authored assets under assets/: snack-sprites.svg (six frames), color-symbols.svg (four frames), ink-grain.svg and block-grain.svg (64px opaque tiles). Corresponding PNG atlases are rasterized at 2x. Separate transparent 128px sprites under assets/native/ support future Lens scene assembly. Concept-sheet raster is generated with Astra's art direction via gpt-image-2-medium; crops are illustration references, not game screenshots.

## Bounded implementation lanes

1. Snack worker: own games/snack-catch except lens/. Repair deterministic bomb-collision test, use actual sprite sheet in falling-item/basket rendering, cached backdrop texture, opaque UI and real touch/pause/replay verification.
2. Stack worker: own games/stack-rush plus common native generation/build integration. Preserve parent fixes (no free perfect-spam, snap X+width, freeze pause time, camera composition). Add face texture in real blocks. Copy assets to static build, include root tests, regenerate exact native cores, remove stale competing generators. Own all games/*/lens so no workers race there.
3. Color worker: own games/color-panic except lens/. Add 30-second overall timer, expose countdown, show real recap on timer/heart expiry, repeated-key protection, actual colored word Stroop cue, consistent sprite symbols, real browser verification.

Full instructions: docs/repair-*.md. Each lane runs a bounded GLM process with no further delegation, no broad process killing, and no git/deploy writes. Stop on rate limits. Original cutoff was respected; user resumed after 18:00 UTC+8. New repair deadline is docs/deadline.json. No recurring jobs.

## Acceptance gates

- Spec first: correct mechanics, meaningful scoring, real loss condition, restart, pause freezes simulation and resume advances it, no accidental double input, exactly 30 seconds for timed modes.
- Then quality: pure deterministic cores, no stale embedded native code, no all-objects-same-asset fake integration, cached textures, maxDPR1.5, readable bomb/colorblind cues, guarded local storage.
- Execute all unit/regression and native test-double contracts. Test-double results must never be described as Lens runtime validation.
- Execute scripts/browser-test.cjs against served built dist, actual touch and keyboard events, 360x640/390x844/1280x720, screenshots, zero unexpected page errors or asset failures. Re-check final best storage and normal-mode QA hook exclusion.
- Build, commit to private repository and push; deploy browser preview with Vercel if auth works. Verify build-info commit and each exact live game URL before claiming deployed.
- Snapchat native gates still outstanding: install/open Lens Studio, assemble scene, assign Inspector inputs, native preview, paired-phone testing, then account submission. No fabricated .lsproj or Snapcode.

## Exclusions

Never touch automated-newsletter, pitchforge or pitch-therapy. No changes to any other Hermes profile, no unrelated apps or credentials.
