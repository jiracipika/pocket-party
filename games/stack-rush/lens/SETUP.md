# stack-rush Lens Studio setup

Use the maintained scene setup guide at `../../../native/README.md`. It includes the exact common hierarchy, Inspector input names, game-specific objects, normalized anchors, pooling and API references.

Regenerate this controller from the project root: `node scripts/build-lenses.cjs`. The embedded core is checked for exact source equality by `tests/native-adapter.test.cjs`.

This is JavaScript source, NOT an exported Lens project. Native compilation, graphics, touch handling and publication remain unverified until exercised in Lens Studio and Snapchat. The browser build is independently playable.
