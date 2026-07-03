# First Slice

Start by making a real game app run through the Patchpit host with the smallest
useful workspace.

## Goal

Open a hosted workspace that mounts a live game/session doc and renders one
tablet view plus one spatial/table view from the same state.

## End-User Shape

A user opens a workspace link, lands in opshop, sees the game app as the primary
tablet surface, sees a shared table projection of the same session, uses one
mounted tool or asset fixture, and can inspect one useful diagnostic.

The tablet view is the control surface. The spatial/table view is the public
projection. The first slice only needs basic pick-to-focus between them.

## Build Order

1. Add Patchpit launch parsing for `app`, `workspace`, `source`, `sync`, and
   `delegation`.
2. Create the allow-all host broker with real request/decision records.
3. Add plain runtime rows: app refs, app instances, containers, mounts, config,
   surfaces, scene objects, pick targets, interaction events, diagnostics.
4. Add a fixture workspace doc that mounts one live session doc.
5. Launch opshop as a Patchpit app.
6. Launch the game app as a mounted Patchpit app/surface inside that workspace.
7. Project the session into Royal descriptors through Tarstate.
8. Return pick/focus events through the Patchpit host by stable ID.
9. Add one external config patch from a companion fixture.
10. Add diagnostics for missing ref, bad config path, and denied host call.

## Acceptance

The first slice is done when:

- a user can open an opshop workspace from a `workspace` hash
- the workspace mounts a live session doc
- the game app renders as a tablet control surface
- the same session renders as a spatial/table projection
- focus can move between tablet and table through stable IDs
- a companion fixture can configure focus or layout through the host
- a synthetic denied-call fixture produces a diagnostic
- no app receives raw Automerge, Tarstate, Royal, or browser handles
- one useful diagnostic is inspectable

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
