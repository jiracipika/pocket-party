# Astra acceptance review — pending final polish

Independent browser suite currently exercises 33 gameplay/layout checks, but final assertion fails on Color Panic asset HTTP404s: app requests games/color-panic/assets/color-symbols.svg and ink-grain.svg. Actual assets are at ../../assets/. Confirm final worker fixes those before claiming green.

Screenshot review:
- Snack Catch 360x640: controls/viewport fit, actual basket sprite loads, but the basket is vertically squashed. Renderer scales logical640px height into a short playfield. Keep sprite visual aspect correct in physical pixels (adjust draw height for x/y scale; position around same basket collider); do not change core collision dimensions. Falling circular snacks should not become pancakes either.
- Stack Rush actual grain appears on background/block; initial frame legitimately starts low. Capture after building multiple layers rather than claiming an empty start frame proves tower composition.
- Color Panic color word is now readable matching ink with conflicting semantic word. Asset fallback shapes show until root-relative load is fixed. Confirm actual atlas is loaded, not merely the fallback.
- Landing page's original SVG illustrations are valid Astra art; new raster concept crops currently live only in assets/. Consider using small cropped illustrations on start panels only if they do not crowd touch controls. Do not replace functional playfields with raster mockups.

Native source must be regenerated after final Color core edits, otherwise exact-core equality test will fail by design.

Final quality gate uses built dist (not stale source): npm run build:lenses, npm test, npm run build, serve dist on a fresh port, BASE_URL=... npm run test:browser. All HTTP errors count as failures. Verify actual deployed build-info.json commit and exact game routes.
