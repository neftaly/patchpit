# Vision

This is not an Automerge-based Unreal.

The stack should behave more like a browser for composable game/workspace apps:

```text
Patchpit Browser/OS/shell
-> host runtime
-> opshop and mounted app instances/docs
-> Tarstate views
-> Royal tablet/spatial projection
```

The first game app is the forcing function. Patchpit should make that app more
composable, inspectable, shareable, and multi-view.

## Why It Exists

The game app should be able to run as a hosted workspace instead of a special
standalone route.

That gives us:

- one host model for game, editor, tools, devtools, and companion apps
- one doc/mount model for game state, assets, settings, tools, and derived views
- one projection path for tablet, desktop, and spatial views
- one diagnostics path for broken refs, bad config, denied calls, and renderer
  issues
- one future auth/delegation seam

## What We Borrow From Spatial Browser Research

Borrow the browser properties:

- unknown content can launch by reference
- app effects cross a host boundary
- independent sources can compose in one workspace
- content state is separate from display projection
- device projection is chosen by host/renderer, not hardcoded by content

Do not copy a native engine stack or treat any external file format as the
product.

## What This Is Not

This is not:

- Unreal or Unity
- a physics/gameplay engine
- a renderer-only project
- an MSF conformance project
- a generic platform before the game app needs it

If a feature does not help the first game app dogfood the stack, it waits.
