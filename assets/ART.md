# Astra art pack

Art direction and original SVG sprite/texture artwork authored by Astra. Raster concept sheet generated via the image tool (gpt-image-2-medium), then cropped for the three games. Raster is illustration, not a gameplay screenshot.

snack-sprites.svg: transparent atlas 384×64; six 64×64 cells: apple, donut, cookie, banana, bomb, basket. All shape fills opaque. Preserve logical hitboxes; do not give bombs snack colors.
color-symbols.svg: transparent atlas 256×64; four 64×64 cells: red triangle, green circle, blue square, yellow diamond. Symbol order matches Color Panic core.
ink-grain.svg: 64×64 seamless dark opaque stipple tile for backgrounds. No per-frame filter needed; cache pattern.
block-grain.svg: 64×64 warm opaque stipple tile. Use within block face bounds only, not over platforms/collision cues.
*-hero.webp: cropped raster concept illustrations for start/launcher art, not gameplay background plates.

Palette: night #0a0a0f, ink #15121b, paper #fff1bf, mint #7dffb2, warm yellow #ffe66d, coral #ff7668, lilac #bd9cff. Dark UI with no translucent scenery, bloom or glass. Shapes remain readable at actual small gameplay size.
