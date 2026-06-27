# Royal And Tarstate Shipping Layout

This proposal moves Royal and Tarstate packages out of patchpit into a clean
shipping repo, then makes patchpit consume them like ordinary external
packages. Patchpit remains the lab, consumer, research, and commit-history
archaeology repo. The extracted repo should contain stable packages, fixtures,
small examples, and docs generated from settled decisions, not planning notes.

It is based on the current local shape:

- `packages/renderer-core`: `@royal/renderer-core`
- `packages/react-regl-fiber`: `react-regl-fiber`
- `packages/royal-tarstate-lens`: `@royal/tarstate-lens`
- `packages/tarstate`: `@patchpit/tarstate`
- patchpit apps importing those packages directly through workspace aliases

## Recommendation

Use scoped package names as the canonical public API, with adapter directory
names that remain readable in the repo:

| Current package | Shipping directory | Public package after split | Role |
| --- | --- | --- | --- |
| `packages/tarstate` / `@patchpit/tarstate` | `packages/tarstate-core` | `@tarstate/core` | Generic schema, source, query, evaluation, diagnostics, and write engine. |
| `packages/renderer-core` / `@royal/renderer-core` | `packages/renderer-core` | `@royal/renderer-core` | Dependency-light Royal scene data, primitives, transforms, cameras, materials, text, and authoring helpers. |
| `packages/react-regl-fiber` / `react-regl-fiber` | `packages/react-royal-fiber` | `@royal/react` | Canonical React integration: JSX runtime, `<Canvas>`, React-facing facade over renderer-core, and the current WebGL executor while that executor is still coupled to the root. |
| new future adapter | `packages/solid-royal` | `@royal/solid` | SolidJS integration with its own JSX runtime and Solid peer dependency. |
| new future adapter | `packages/vanilla` | `@royal/vanilla` | Framework-free imperative root once the current root is no longer React-package-owned. |
| new alias package | `packages/react-royal-fiber-compat` | `react-royal-fiber` | Compatibility and discovery alias that re-exports `@royal/react`. |
| optional temporary alias | `packages/react-regl-fiber-compat` | `react-regl-fiber` | Deprecated bridge for existing patchpit and prototype imports only. |
| `packages/royal-tarstate-lens` / `@royal/tarstate-lens` | `packages/royal-tarstate-lens` | `@royal/tarstate-lens` | Royal-specific Tarstate schema, rows, queries, store lenses, probes, and writer routes. |

`react-regl-fiber` should not survive as a public name except as a short-lived
migration bridge. The word `regl` is wrong for the current implementation and
actively fights the Royal brand and future WebGL2/WebGPU/XR backend work.

`react-royal-fiber` is the right replacement phrase for the old unscoped name,
and the implementation directory should use that name. It should still be an
alias package rather than the canonical import path. The canonical path should
be `@royal/react` because it keeps all official Royal packages under one scope,
reads cleanly in JSX pragmas, and leaves room for Solid, vanilla, and future
framework adapters without making "fiber" a Royal-wide concept.

Do not publish both `@royal/react` and `@royal/fiber` as first-class packages.
That creates two names for the same API. If `@royal/fiber` is desired for
ecosystem familiarity, reserve it as an alias of `@royal/react`, not as a
separate surface.

## Target Repository Layout

Create a sibling shipping monorepo, for example `royal`, with this initial
layout:

```txt
royal/
  apps/
    examples-react/           # settled React examples and browser smoke
    examples-solid/           # future, when @royal/solid exists
    examples-vanilla/         # future, when @royal/vanilla exists
  packages/
    tarstate-core/            # @tarstate/core
    renderer-core/            # @royal/renderer-core, domless scene model
    react-royal-fiber/        # @royal/react
    react-royal-fiber-compat/ # react-royal-fiber alias package
    react-regl-fiber-compat/  # temporary react-regl-fiber alias package
    solid-royal/              # future @royal/solid
    vanilla/                  # future @royal/vanilla
    royal-tarstate-lens/      # @royal/tarstate-lens
  fixtures/
    DamagedHelmet/
  docs/
    api/                      # generated or settled package docs
    decisions/                # short outcome records, not research logs
  scripts/
  tests/
  package.json
  pnpm-workspace.yaml
  tsconfig.json
  vite.config.ts
```

Do not move patchpit research notes, planning docs, or archaeology into this
repo. Keep documents such as renderer roadmap drafts, Tarstate/Royal research,
benchmark planning notes, and migration narratives in patchpit. The shipping
repo docs should be distilled from settled outcomes: package READMEs, API
references, compatibility notes, and brief decision records that explain the
current contract.

The first extraction should move code without forcing every architectural split
at once. Keep the current WebGL executor inside `@royal/react` initially because
that is where `createRoot`, JSX lowering, and the root lifecycle already meet.
Split a backend package later, probably `@royal/webgl` or
`@royal/backend-webgl`, only after the root/backend contract is measured and
stable.

`@royal/renderer-core` is already the domless core. Do not add a second
`renderer-domless` or `@royal/core` package during the split. Add
`@royal/vanilla` only when there is a stable imperative root that is useful
without React or Solid.

Keep `@royal/tarstate-lens` in the Royal scope. It is a Royal adapter over a
generic Tarstate engine, not a generic Tarstate feature.

## Adapter Package Details

### React

`packages/react-royal-fiber` should publish `@royal/react`.

Exports:

- `@royal/react`: React-facing facade, `<Canvas>`, `createRoot`, stable
  renderer-core authoring helpers, and public React types.
- `@royal/react/root`: root lifecycle entry point. Keep this export only while
  root ownership is still in the React package; after `@royal/vanilla` exists,
  this should forward to the vanilla root for compatibility.
- `@royal/react/jsx-runtime` and `@royal/react/jsx-dev-runtime`: automatic JSX
  runtime entry points for `/** @jsxImportSource @royal/react */`.
- `@royal/react/testing`: optional supported test helpers, only if downstream
  patchpit tests need helpers that are currently imported from `src/webgl/*`.

Peer dependency policy:

- `react` is a peer dependency.
- `react-dom` is not required unless the package exports a DOM mounting helper.
- If `@royal/react/root` can run without importing React, keep that subpath
  React-free; otherwise move the framework-free root to `@royal/vanilla`
  before claiming root is independent.

### React Aliases

`packages/react-royal-fiber-compat` should publish `react-royal-fiber`.

It should re-export `@royal/react` and mirror these subpaths:

- `react-royal-fiber`
- `react-royal-fiber/root`
- `react-royal-fiber/jsx-runtime`
- `react-royal-fiber/jsx-dev-runtime`
- `react-royal-fiber/testing`, only if `@royal/react/testing` exists

`packages/react-regl-fiber-compat` should publish `react-regl-fiber` only as a
temporary deprecated bridge. Keep it implementation-free, mark it deprecated in
package metadata when public publishing starts, and remove it after patchpit
and any external prototype consumers have moved.

### Solid

`packages/solid-royal` should publish `@royal/solid`, but not in the first
shipping release unless a real Solid fixture exists.

Solid is not just React with different peer deps. Current Solid TypeScript
setup uses `jsx: "preserve"` and `jsxImportSource: "solid-js"` so Solid's own
compiler can transform JSX. That means `@royal/solid` needs a proved adapter
contract before it promises `/** @jsxImportSource @royal/solid */`. Reference:
Solid's TypeScript configuration docs at
`https://docs.solidjs.com/configuration/typescript`.

Initial acceptance for `@royal/solid`:

- a Solid example app in `apps/examples-solid`
- a Vite/Solid build fixture
- documented TypeScript setup
- a decision on whether Royal elements are Solid components over
  `@royal/vanilla`, Solid compiler configuration, or a custom JSX namespace
- peer dependency on `solid-js`
- no dependency on React or `@royal/react`

If a clean Solid JSX import source is not practical, publish `@royal/solid` as
component helpers over `@royal/vanilla` first and keep JSX-runtime claims out
of the README.

### Vanilla

`packages/vanilla` should publish `@royal/vanilla` only after the imperative
root and backend boundary are stable enough to use without React.

This package should own:

- `createRoot`
- renderer root lifecycle
- frame subscription
- direct render calls over `@royal/renderer-core` scene data
- backend-neutral root options if they exist

It should not own JSX runtimes, React hooks, Solid signals, or app stores.
When this package exists, React and Solid adapters should layer over it instead
of each owning separate root implementations.

## Patchpit Imports After The Split

Patchpit should import the extracted packages by their public names:

```tsx
import { evaluate } from '@tarstate/core';
import { scene, mesh, standardMaterial } from '@royal/renderer-core';
import { Canvas, createRoot } from '@royal/react';
import { createRoot as createRoyalRoot } from '@royal/react/root';
import { royalLensSchema, royalQueries } from '@royal/tarstate-lens';
```

JSX files should move from:

```tsx
/** @jsxImportSource react-regl-fiber */
```

to:

```tsx
/** @jsxImportSource @royal/react */
```

Concrete patchpit mapping:

| Current patchpit dependency | Replace with |
| --- | --- |
| `@patchpit/tarstate` | `@tarstate/core` |
| `react-regl-fiber` | `@royal/react` |
| `react-regl-fiber/root` | `@royal/react/root` |
| `react-regl-fiber/jsx-runtime` | `@royal/react/jsx-runtime` |
| `react-regl-fiber/jsx-dev-runtime` | `@royal/react/jsx-dev-runtime` |
| `@royal/renderer-core` | keep `@royal/renderer-core` |
| `@royal/tarstate-lens` | keep `@royal/tarstate-lens`, but sourced from the external monorepo |

Patchpit should settle on the scoped package imports. Use `react-royal-fiber`
only as a short migration aid or external-discovery alias, and use
`react-regl-fiber` only as a deprecated bridge while old imports are being
removed.

Patchpit tests and scripts should stop importing extracted package internals
such as `../packages/react-regl-fiber/src/webgl/matrix`. Either move those
tests upstream into the Royal monorepo or add an explicit testing export such
as `@royal/react/testing` for supported helpers. Patchpit should test its app
adapters, not Royal internals.

## Migration Sequence

1. Freeze the current behavior in patchpit with import and boundary inventory.
   The existing package-boundary test already proves useful constraints:
   renderer-core does not depend on React or shader tooling, React depends on
   renderer-core, and reusable packages do not depend on apps.
   Decomplection check: record current coupling before moving files.

2. Create the new monorepo and copy package implementation sources with
   history where possible: `packages/tarstate`, `packages/renderer-core`,
   `packages/react-regl-fiber`, `packages/royal-tarstate-lens`, stable Royal
   fixtures, and tests that assert package behavior. Copy only example routes
   that are settled enough to serve as API fixtures.
   Decomplection check: do not copy `@patchpit/connectors`, Infinigen,
   chargrid-only prototypes, capability-lab experiments, patchpit shell/runtime
   code, research docs, planning docs, or archaeology notes.

3. Rename package manifests, source directories, public type names, and import
   paths inside the new monorepo:
   `@patchpit/tarstate` to `@tarstate/core`,
   `packages/react-regl-fiber` to `packages/react-royal-fiber`,
   `react-regl-fiber` to `@royal/react`, and
   `react-regl-fiber/*` to `@royal/react/*`.
   Decomplection check: keep source directory renames mechanical and avoid
   changing renderer behavior during the package rename.

4. Add alias packages only after the canonical packages build:
   `react-royal-fiber` should re-export `@royal/react` and expose matching
   `root`, `jsx-runtime`, and `jsx-dev-runtime` subpaths. Keep
   `react-regl-fiber` only as a temporary deprecated bridge if patchpit needs
   an extra migration step.
   Decomplection check: aliases contain no implementation code.

5. Generate clean shipping docs from settled outcomes. Package READMEs,
   generated API docs, migration notes, and short decision records belong
   upstream. Research trails, rejected ideas, benchmark planning, and local
   lab notes remain in patchpit.
   Decomplection check: upstream docs describe the current contract, while
   patchpit docs preserve exploratory context.

6. Establish external consumption before deleting local patchpit packages.
   Patchpit package manifests should use semver ranges for normal CI. For local
   development speed, use a developer-only link setup or overrides pointing to
   the sibling monorepo build output. Do not add the sibling monorepo back into
   patchpit's committed workspace.
   Decomplection check: patchpit remains an app monorepo, not Royal's build
   orchestrator.

7. Migrate patchpit imports app by app:
   promoted `royal-examples` routes should move upstream first, then
   `patchpit-3d-viewer`,
   `chargrid-lab`, `infinigen`, `tarstate-example`, and
   `tarstate-capability-lab`. Replace source-path test imports with upstream
   tests or public testing exports.
   Decomplection check: app-owned adapters stay in the app until a second app
   needs the exact same abstraction.

8. Remove the local packages from patchpit only after patchpit CI is green
   against installed external packages. Keep no local shadow packages named
   `@royal/*` or `@tarstate/*`; shadows make dependency bugs look like source
   bugs.
   Decomplection check: one owner per package name.

## CI And Build Boundaries

The Royal/Tarstate monorepo should own package correctness:

- `@tarstate/core`: TypeScript build, unit tests for schema/source/query/evaluate/write/diagnostics, columnar-source tests and benchmarks. No React, DOM, WebGL, or app imports.
- `@royal/renderer-core`: TypeScript build and primitive/value tests. No React, Tarstate, DOM, WebGL, GPU resource, or app imports.
- `@royal/react`: package build, JSX runtime tests, root lifecycle tests, fake WebGL render tests, browser smoke for examples, React as a peer dependency.
- `react-royal-fiber`: alias export tests proving every public subpath resolves to `@royal/react`.
- `react-regl-fiber`: deprecated alias export tests until the bridge is removed.
- `@royal/solid`: no CI obligation until the package exists; when added, it needs a real Solid build fixture, peer dependency checks, and adapter tests that do not import React.
- `@royal/vanilla`: no CI obligation until the root/backend boundary exists; when added, it owns framework-free root lifecycle and backend-neutral root tests.
- `@royal/tarstate-lens`: schema/query/probe/writer-route tests. Depends on `@tarstate/core`; may use public `@royal/renderer-core` types only when needed. No React, DOM, WebGL, or app packages.
- examples and fixtures: Royal-owned browser smoke tests and GPU capability checks.
- package-boundary test: enforce dependency direction and prevent source-path imports across packages.
- publish check: `pnpm -r build`, `pnpm -r test`, and `pnpm -r publish --dry-run` or equivalent pack validation.
- docs check: generated API docs and README examples compile; planning/research docs are not part of the shipping repo.

Patchpit CI should become a consumer check:

- typecheck and build apps against installed `@royal/*` and `@tarstate/core`
  packages
- run app-local tests such as chargrid adapter tests, capability-lab tests, and
  Infinigen scene mapping tests
- run exploratory Royal/Tarstate benchmarks only when patchpit is using them as
  labs, not as upstream package release gates
- avoid Royal/Tarstate internal benchmarks except as separate upstream release
  gates

## Ownership Boundaries

Tarstate owns:

- generic relation schema primitives
- relation sources and lookup contracts
- query composition and evaluation
- write patches and diagnostics
- generic columnar/source experiments that do not know about Royal

Tarstate does not own:

- Royal row names
- renderer scene primitives
- app store structure
- React hooks or components
- browser handles, GPU handles, workers, or capability permissions

Royal renderer-core owns:

- render authoring data and helper constructors
- cameras, passes, materials, geometry, text, transforms, and coordinate systems
- renderer-independent scene contracts

Royal renderer-core does not own:

- Tarstate queries
- React lifecycle
- WebGL resource lifetime
- app state or capability policy

Royal React owns:

- JSX import source and runtime
- React root lifecycle
- `<Canvas>` and React-facing helpers
- current WebGL root implementation until a backend package is split

Royal Solid owns, when it exists:

- Solid-facing components and adapter helpers
- Solid peer dependency and example build setup
- any Solid-specific JSX or compiler contract that has been proven by fixtures

Royal Vanilla owns, when it exists:

- framework-free root lifecycle
- direct imperative render API
- backend-neutral root options
- the shared root surface that framework adapters can wrap

Royal Tarstate lens owns:

- Royal relation rows, schema, and queries
- Royal probe and diagnostic rows
- store-lens helpers while they are Royal-specific
- writer routes for relation-shaped Royal commands

Royal/Tarstate shipping docs own:

- generated API references
- package READMEs
- migration guides for public package names
- short decision records that state settled package contracts

Patchpit docs keep:

- research notes and planning documents
- renderer roadmap drafts and benchmark wishlists
- commit-history archaeology and migration narratives
- exploratory findings that are not yet package contracts

Patchpit apps keep:

- Infinigen scene mapping, stream policy, and domain data
- chargrid Yoga layout, texture paging prototypes, pick fuzz fixtures, and
  app-specific conversion into Royal rows
- capability-lab runtime policy and e2e scenarios
- connectors and patchpit shell orchestration
- any app store shape that is not a reusable Royal or Tarstate contract

## Experimental Work That Stays In Patchpit

Keep these in patchpit until they become settled package contracts:

- renderer roadmap planning, benchmark wishlists, and target architecture
  drafts
- Tarstate/Royal research notes and migration narratives
- chargrid lab prototypes: Yoga layout integration, texture atlas and paging,
  vector glyph pipeline, GPU pick simulation, HZB/occlusion probes, and scene
  source experiments
- Infinigen Royal/Tarstate integration, streaming policy, and domain scene
  mapping
- capability-lab runtime and browser e2e probes
- source-path tests that are investigating package internals
- exploratory Tarstate columnar/GPU/WASM work until it is promoted into
  `@tarstate/core` or a separate public package
- compatibility archaeology for `react-regl-fiber` and old patchpit imports

Promotion rule: move an experiment upstream only when it has a named package
owner, a stable public contract, package-local tests, and a downstream patchpit
consumer that can use it through the public package import.

## What Not To Rename Yet

- Do not rename `@royal/renderer-core` to `@royal/core`. The current name
  correctly says this package is renderer authoring data, not all of Royal.
- Do not create `renderer-domless` as a second core name. `@royal/renderer-core`
  is already the domless scene model.
- Do not create `@royal/state` yet. Add it only when more than one adapter needs
  Royal row/command/diagnostic contracts without depending on Tarstate.
- Do not publish `@royal/solid` until there is a real Solid fixture and a
  settled JSX/compiler story.
- Do not publish `@royal/vanilla` until the imperative root is proven outside
  the React package.
- Do not create `@tarstate/react`, `@tarstate/automerge`, or
  `@tarstate/links` during this extraction. Those may be valid later, but the
  immediate split only needs `@tarstate/core`.
- Do not rename app-local files just because they contain Royal or Tarstate in
  the name. Move shared contracts first; app adapters can be renamed when they
  become upstream packages.
- Do not migrate patchpit planning docs or research notes upstream. Distill
  stable outcomes into upstream READMEs and API docs instead.
- Do not force a WebGL backend package during the package-name migration. The
  backend split should be gated by a root/backend contract and tests.
- Do not remove deprecated public type names such as `ReactReglRoot` in the
  first release. Add `ReactRoyalRoot` aliases, migrate internal docs, then
  remove old names in a later major release.

## Release Shape

First public release from the new monorepo:

- `@tarstate/core@0.x`
- `@royal/renderer-core@0.x`
- `@royal/react@0.x`
- `@royal/tarstate-lens@0.x`
- `react-royal-fiber@0.x` as an alias package
- `react-regl-fiber@0.x` as a deprecated temporary alias only if needed for
  migration

Patchpit should then consume those exact public packages. Local development can
still be fast through link/override workflow, but the committed patchpit repo
should behave like any other downstream application.

Not in the first release unless fixtures already exist:

- `@royal/solid`
- `@royal/vanilla`
- `@royal/webgl` or `@royal/backend-webgl`
- `@royal/state`
