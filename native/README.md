# Native Lens Studio adapters

These are source adapters, not exported Lens projects. They have NOT been compiled in Lens Studio or run in Snapchat. Node VM tests exercise our event wiring with test doubles only; that is not native validation.

## Generate

    node scripts/build-lenses.cjs

This embeds each actual `games/<slug>/core.js` verbatim inside its controller. There is no separate handwritten copy of game rules and no ScriptAsset.api module assumption. The `native/adapter.js` file is the common scene/input layer; `scripts/build-lenses.cjs` owns generation.

## Scene setup (one new Lens project per game)

1. Add a Screen Image using Lens Studio's 2D scene tools. Use the automatically created orthographic camera / screen hierarchy. Name its parent `PlayArea`. It must have a ScreenTransform in a valid screen hierarchy.
2. Set PlayArea anchors to left -0.90, right 0.90, top 0.70, bottom -0.70; all offsets zero. This reserves 5% horizontal and 15% vertical screen margins. Verify these against actual Snapchat controls on your phone: these are starting values, not a safe-area guarantee.
3. Use a dark opaque Screen Image as background, with independent material. All gameplay objects below must be DIRECT children of PlayArea so the normalized anchor conversion is correct.
4. Import `games/<slug>/lens/GameController.js` as a JavaScript asset, attach it to a separate scene object and assign its `playArea` input to PlayArea's ScreenTransform.
5. Add Screen Text objects Score, Timer and Message under PlayArea. Assign Text components to `scoreText`, `timeText`, `messageText`. Suggested anchor centers are (0,0.88), (0,0.73), and (0,0.48); set sufficiently wide bounds to avoid wrapping. Text is white. Tune font size in Studio so actual device text is readable.
6. Add a Pause screen control at center (0.82,0.90), width 0.28, height 0.18 in normalized PlayArea units. Give it a visible pause icon and assign its ScreenTransform to `pauseButton`. Test at least a 44-pixel hit region on your device.
7. Add StartPanel, OverPanel and PausePanel as screen-image/text overlay groups. All cover PlayArea and share its local bounds (-1..1). Assign their SceneObjects to the corresponding inputs. Give the start panel the game name, one-line instructions and “Tap to start”; the others “Tap to retry” and “Tap to resume.” Keep Message text later in render order than the panel background so score/recap stays readable.
8. Add game-specific objects below. Leave irrelevant inputs unassigned (e.g. no basket is needed for Color Panic).

### Snack Catch

- Basket: a mint Screen Image, assign SceneObject to `basket`. Its ScreenTransform is positioned/sized by the controller. A plain white texture with a mint material works.
- ItemPool: create 24 Screen Text objects as direct PlayArea children. Assign their SceneObjects to `itemPool` in order. Each needs a Text and ScreenTransform. Font must support ● and ✹. The controller uses mint circles for snacks and red starbursts for bombs, so they differ by shape as well as color. Set font size and alignment centered, with auto-fit if available. Initial enabled state does not matter.
- These are intentionally simple native placeholders, not the illustrated browser snack art. You can replace them with original artwork later without changing collision rules.
- Dragging uses `playArea.screenPointToLocalPoint`, not raw screen X; it stays aligned with the safe area.

### Stack Rush

- MovingBlock: a yellow Screen Image with white texture, assign to `movingBlock`.
- LayerPool: 24 Screen Images (separate SceneObjects), assign to `layerPool`. Use warm gold/coral materials. The controller maps visible tower blocks to this pool. Size and positions are driven by code; offsets zero.
- Touch PlayArea to drop. Read the actual layer count separately from score (perfect drops add bonus points).
- Native rendering omits browser particle/debris effects; game rules are the same embedded core.

### Color Panic

- TargetText: Screen Text centered at (0,0.35), width 1.6, height 0.35; assign `targetText`. The script changes word and ink color.
- TargetSymbol: Screen Text centered at (0,0.08), width 0.5, height 0.3; assign `targetSymbol`. Symbols provide a non-color matching cue.
- Four choice groups in a 2x2 grid, centers (-0.48,-0.34), (0.48,-0.34), (-0.48,-0.72), (0.48,-0.72), each width 0.86, height 0.28. Each has a dark Screen Image and centered Text. Assign the four ScreenTransforms to `choiceTransforms`, and Text components to `choiceLabels`, in that order: red triangle, green circle, blue square, yellow diamond. Minimum phone hit area 44 pixels.
- Touch is tested against each actual ScreenTransform, not guessed fixed screen quadrants.

## API grounding

- https://developers.snap.com/lens-studio/features/scripting/touch-input documents TouchStart/Move/End events, `getTouchPosition`, and `global.touchSystem.touchBlocking`.
- https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.ScreenTransform documents `screenPointToLocalPoint` returning normalized -1..1 within the transform and `containsScreenPoint` for hit-testing. Anchor coordinates are -1..1, NOT 0..1.
- Score storage uses the standard `global.persistentStorageSystem.store` getInt/putInt API, guarded so storage failure does not break play.

Native bests are local. There is no friend leaderboard, Bitmoji, account system, native audio or turn-based integration yet. All require independent native testing before any publishing claim. Follow `docs/SNAPCHAT-HANDOFF.md` for preview, device and publication gates.
