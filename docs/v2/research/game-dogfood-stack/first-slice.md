# First Slice

Start by making the existing game app run through Patchwork with the smallest
useful workspace.

## Goal

Open a hosted workspace that mounts a live game/session doc and renders one
tablet view plus one spatial/table view from the same state.

## Build Order

1. Add Patchwork launch parsing for `doc`, `template`, `sync`, and `delegation`.
2. Create the allow-all host broker with real request/decision records.
3. Add plain runtime rows: app refs, app instances, containers, mounts, config,
   surfaces, scene objects, pick targets, interaction events, diagnostics.
4. Add a fixture workspace doc that mounts one live session doc.
5. Launch opshop as a Patchwork app.
6. Launch the game app as a mounted Patchwork app/surface inside that workspace.
7. Project the session into Royal descriptors through Tarstate.
8. Return pick/focus events through Patchwork by stable ID.
9. Add one external config patch from a companion fixture.
10. Add diagnostics for missing ref, bad config path, and denied host call.

## Acceptance

The first slice is done when:

- a user can open an opshop workspace from a `doc` hash
- the workspace mounts a live session doc
- the game app renders as a hosted surface
- the same session has a spatial/table projection
- a companion fixture can configure focus/layout through the host
- no app receives raw Automerge, Tarstate, Royal, or browser handles
- diagnostics are inspectable

## Defer

- real auth
- final schemas
- package publishing
- MSF import/export
- audio
- animation
- physics
- XR-specific anchoring

Each deferred feature should wait until the hosted game slice needs it.
