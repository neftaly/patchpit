# Boundaries

The boundaries are good enough to start. Do not split into more repos yet.

## Patchpit

Patchpit is the browser shell/kernel.

Owns:

- workspace/app contracts
- namespace and mounts
- runtime/container rows
- host-call broker
- allow-all auth seam
- diagnostics
- launch policy
- asset/cache policy
- devtools surfaces

## Patchwork

Patchwork is the host/runtime layer inside Patchpit.

Owns:

- launch envelopes
- app instances
- runtime containers
- app config
- app mounts
- iframe/worker/direct transports
- app-visible host APIs
- cross-app reach-in through host calls

Patchwork is not the game app and not the renderer.

## opshop

`opshop 🧩` is the first workspace app.

Owns:

- arranging docs, surfaces, and scene projections in a workspace
- showing mounted sessions/tools/assets
- tablet/desktop/spatial workbench UI
- proving the Patchwork app loop

Does not own:

- game rules
- global launch policy
- sync/auth
- renderer internals
- Tarstate internals
- service/package conformance

## Game App

The game app owns game semantics.

Owns:

- game manifest concepts
- templates/scenarios/pieces/zones
- rules/tool plugins
- setup and play UX
- game-specific document shape
- game-specific validation

The game app should run inside Patchwork and may be mounted inside an opshop
workspace, but it should not depend on opshop as its core runtime.

## Tarstate

Tarstate owns generic query/materialization:

- relations
- sources
- views
- watches
- joins across durable docs, runtime rows, and ephemeral state

Tarstate should not own game semantics or renderer state.

## Royal

Royal owns projection and interaction primitives:

- render descriptors
- scene/table/panel primitives
- picking/focus/input summaries
- tablet/desktop/spatial rendering backends

Royal should not launch apps, authorize writes, or run rules.

## Automerge And Future Auth

Automerge owns durable replicated truth.

Future auth/delegation replaces the allow-all authorizer. V1 still routes every
host call through:

```text
subject -> action -> resource -> decision
```

Do not skip this seam.
