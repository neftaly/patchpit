# Game Dogfood Stack

This folder is the implementation plan for making the first game app dogfood
Patchpit as the Browser/OS/shell: its host runtime, the `opshop` app, Tarstate,
Royal, and Automerge.

Keep this focused on stack shape and implementation boundaries.

## Claim

The stack earns its keep if a game app can use it for:

- launching a live session
- mounting game docs, assets, tools, and surfaces
- showing tablet and spatial projections of the same state
- allowing companion tools to configure or inspect a session through the host
- keeping durable game truth separate from spatial placement
- sharing sessions without turning the app into a one-off standalone route

## Docs

- `vision.md` - why this stack exists and how it differs from a game engine.
- `boundaries.md` - what each repo/layer owns.
- `launch-and-docs.md` - `workspace` / `source` launch shape and linked docs.
- `first-slice-api.md` - smallest useful host contract for the first build.
- `spatial-bindings.md` - game state versus personal/shared/world placement.
- `first-slice.md` - the smallest implementation slice to start with.

## Non-Goals

For the first slice, do not build:

- package publishing
- a generic metaverse browser pitch
- MSF import/export
- physics
- audio
- animation
- real auth
- final schemas

Those can come after the game app is running through the Patchpit host.
