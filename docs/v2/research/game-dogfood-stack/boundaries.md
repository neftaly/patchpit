# Boundaries

The boundaries are good enough to start. Do not split into more repos yet.

## Patchpit Monorepo

Patchpit is the Browser/OS/shell monorepo. It launches apps, owns workspaces,
brokers host capabilities, and coordinates docs, surfaces, and projections.

Owns:

- workspace/app contracts
- namespace and mounts
- launch envelopes
- app instances
- runtime/container rows
- host-call broker
- allow-all auth seam
- diagnostics
- launch policy
- asset/cache policy
- devtools surfaces
- app config
- app mounts
- iframe/worker/direct transports
- app-visible host APIs
- cross-app reach-in through host calls

Patchpit contains apps and packages, but Patchpit itself is the product boundary:
the browser/OS/shell. It should only split new packages out of the app host
after the boundary is proven in code.

## opshop

`opshop 🧩` is the first workspace app target inside the Patchpit monorepo.

Owns:

- arranging docs, surfaces, and scene projections in a workspace
- showing mounted sessions/tools/assets
- tablet/desktop/spatial workbench UI
- proving the Patchpit app loop

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

The game app should run inside the Patchpit host and may be mounted inside an opshop
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
