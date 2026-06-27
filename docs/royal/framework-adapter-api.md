# Royal Framework Adapter API

This note prototypes the public adapter boundary before the Royal/Tarstate
monorepo split. It is based on the current local shape:

- `@royal/renderer-core` owns pure scene data and helper constructors.
- `react-regl-fiber` currently owns the React JSX runtime, `<Canvas>`, the
  imperative `createRoot(canvas)`, and the WebGL root implementation.
- `apps/royal-examples` imports `react-regl-fiber` through
  `/** @jsxImportSource react-regl-fiber */` and `<Canvas>`.
- `apps/chargrid-lab` imports `react-regl-fiber/root` directly and already
  exercises the canvas-only path without ReactDOM.
- `@royal/tarstate-lens` is being split as the Royal-specific Tarstate row and
  lens layer.

## Decision

Use `@royal/react` as the canonical React package. Publish
`react-royal-fiber` as a compatibility and discovery alias that re-exports
`@royal/react`, including `root`, `jsx-runtime`, and `jsx-dev-runtime`.

Do not make `react-royal-fiber` the canonical package name. It is useful for
people searching for a React Three Fiber-shaped API, but "fiber" is a React
implementation concept and should not become the naming anchor for Solid,
vanilla, workers, XR, WebGPU, or headless rendering.

Keep `react-regl-fiber` only as a temporary migration bridge. Its name is now
misleading because the current implementation is direct WebGL, and future
backends should not advertise a specific GL helper library.

## Public Packages

| Package | Role | Important imports |
| --- | --- | --- |
| `@royal/renderer-core` | Pure renderer-independent scene data, cameras, passes, nodes, materials, geometry, text, transforms, and feature contract types. | `@royal/renderer-core` |
| `@royal/react` | Canonical React adapter: React JSX runtime, React `<Canvas>`, hooks, React lifecycle, and React-facing facade over core authoring helpers. | `@royal/react`, `@royal/react/root`, `@royal/react/jsx-runtime`, `@royal/react/jsx-dev-runtime` |
| `react-royal-fiber` | Alias package for ecosystem familiarity and migration from the old unscoped name. No implementation code. | `react-royal-fiber`, `react-royal-fiber/root`, `react-royal-fiber/jsx-runtime`, `react-royal-fiber/jsx-dev-runtime` |
| `@royal/solid` | Future Solid adapter. Owns Solid components, lifecycle, signals/resources bridge, and possibly a Solid-compatible JSX authoring surface after compiler proof. | `@royal/solid`, `@royal/solid/root`, `@royal/solid/jsx-runtime` only if proven |
| `@royal/vanilla` | Vanilla and domless adapter. Owns imperative roots, headless roots, OffscreenCanvas roots, explicit scheduling, and framework-free event dispatch. | `@royal/vanilla`, `@royal/vanilla/root`, `@royal/vanilla/headless` |
| `@royal/tarstate-lens` | Royal-specific Tarstate rows, queries, snapshots, diagnostics, and row-to-scene projections. No React, Solid, DOM, WebGL, or backend handles. | `@royal/tarstate-lens` |

Later, split the backend executor out of `@royal/react` only after the root
contract is measured. Likely names are `@royal/webgl` or
`@royal/backend-webgl`. Until then, the adapter contract should be shaped as if
the backend can move.

Decomplection check: package names separate authoring data, framework
lifecycle, state projection, and backend effects. Alias packages contain no
runtime policy.

## Boundary Shape

Renderer core should stay stable and boring:

```ts
import type { RenderRoot } from '@royal/renderer-core';

export interface RoyalRendererBackend {
  readonly capabilities: readonly RoyalCapabilityRow[];
  createRoot(surface: RoyalRenderSurface): RoyalRendererRoot<RenderRoot>;
}

export interface RoyalRendererRoot<Scene = RenderRoot> {
  render(scene: Scene): void;
  resize(viewport: RoyalViewport): void;
  dispatch(event: RoyalInputEvent): void;
  dispose(): void;
}
```

Adapters should own everything framework-specific:

```ts
export interface RoyalFrameworkAdapter<Scene = RenderRoot> {
  readonly packageName: string;
  readonly framework: 'react' | 'solid' | 'vanilla' | 'headless';
  readonly jsxImportSource: string | null;
  readonly exposesJsxRuntime: boolean;
  mount(host: RoyalMountHost<Scene>): RoyalAdapterRoot<Scene>;
}

export interface RoyalMountHost<Scene = RenderRoot> {
  readonly surface: RoyalRenderSurface;
  readonly source: RoyalSceneSource<Scene>;
  readonly scheduler: RoyalAdapterScheduler;
}
```

The important split is that adapters subscribe to framework state, external
stores, signals, resources, or direct snapshots, then hand complete `RenderRoot`
snapshots or later patch lanes to a backend root. Renderer core should not know
whether a scene came from React state, Solid signals, a Tarstate query, a worker
message, or a vanilla game loop.

The isolated TypeScript prototype in
`apps/chargrid-lab/src/frameworkAdapterApiPrototype.ts` models this contract
with a memory backend and explicit scheduler.

## JSX Runtime And Type Ergonomics

### React

React should keep the current authoring style:

```tsx
/** @jsxImportSource @royal/react */
import { Canvas, boxGeometry, standardMaterial } from '@royal/react';

<Canvas>
  <scene>
    <pass>
      <perspectiveCamera position={[0, 0, 5]} rotation={[0, 0, 0]} fovY={Math.PI / 4} near={0.1} far={1000} />
      <mesh geometry={boxGeometry({ size: [1, 1, 1] })} material={standardMaterial({ color: [1, 0, 0, 1] })} />
    </pass>
  </scene>
</Canvas>
```

Required exports:

- `@royal/react`: `Canvas`, common renderer-core authoring helpers, React hooks,
  and public types.
- `@royal/react/root`: imperative `createRoot(surface)` that does not import
  ReactDOM and should avoid importing React.
- `@royal/react/jsx-runtime`: `jsx`, `jsxs`, `Fragment`, and `namespace JSX`
  for Royal intrinsic elements.
- `@royal/react/jsx-dev-runtime`: `jsxDEV`, `jsx`, `jsxs`, and `Fragment`.

`@royal/react/root` must remain usable in canvas-only apps like chargrid-lab.
It should not require `react-dom/client`.

### Solid

Solid should not be promised as a copy of the React JSX runtime until a compiler
fixture proves it. Start with a Solid-native API:

```tsx
import { Canvas, createRoyalSceneMemo } from '@royal/solid';

<Canvas scene={createRoyalSceneMemo(() => buildScene(props.sceneId))} />
```

Solid adapter responsibilities:

- Create and dispose the Royal root in Solid lifecycle hooks.
- Subscribe through signals/resources/memos and coalesce scene updates.
- Expose `createRoyalSceneMemo`, `useRoyalRoot`, and capability accessors.
- Add `@royal/solid/jsx-runtime` only if Solid's compiler can reliably lower
  Royal intrinsic scene elements into data without creating DOM nodes.

Decomplection check: Solid signals are a scheduler/source concern. They should
not alter renderer-core scene data or backend root APIs.

### Vanilla And Headless

Vanilla should use explicit roots and scene sources:

```ts
import { createRoot, createHeadlessRoot } from '@royal/vanilla';

const root = createRoot(canvas);
root.render(scene);

const headless = createHeadlessRoot({ width: 640, height: 480 });
headless.render(scene);
```

The vanilla package should expose:

- `createRoot(canvas | offscreenCanvas | surface, options?)`
- `createHeadlessRoot(viewport, options?)`
- `createSceneSource({ getSnapshot, subscribe })`
- `manualScheduler`, `microtaskScheduler`, and `frameScheduler`
- `dispatch(event)` for app-owned input routing

No JSX runtime is needed for the vanilla package.

## State And Tarstate

Tarstate should integrate as a scene source or row lens, not as renderer-core
state:

```ts
import { createRoyalSceneSource } from '@royal/tarstate-lens';
import { Canvas } from '@royal/react';

const source = createRoyalSceneSource(tarstateStore, royalQueries.renderScene);

<Canvas scene={source} />;
```

The shape should be generic:

```ts
export interface RoyalExternalSceneStore<Scene> {
  readonly kind: 'external-store';
  readonly label: string;
  getSnapshot(): Scene;
  subscribe(onStoreChange: () => void): () => void;
}
```

Adapters may provide framework-specific helpers around that generic contract:

- React: `useRoyalScene(source)` or `<Canvas scene={source} />`
- Solid: `createRoyalSceneMemo(source)` or `<Canvas scene={source} />`
- Vanilla: `root.attach(source, scheduler)`

Renderer core and backend roots should only receive `RenderRoot`, patch lanes,
capability rows, and input events. They should not receive Tarstate evaluators,
relation handles, row stores, app store references, or query objects.

Decomplection check: Tarstate owns relation projection and diagnostics;
adapters own subscription and scheduling; backend roots own rendering effects.

## Edge Cases

| Edge case | Adapter rule | Core/backend rule |
| --- | --- | --- |
| Multiple roots | Every root gets an explicit id and separate lifecycle. No module-level current root. Shared asset caches must be explicit. | Backend roots own their GPU resources and dispose independently. |
| SSR or no DOM | JSX may create scene data, but no WebGL context is created during server render. Headless roots accept viewport data without DOM. | Core scene helpers are pure. Backend root construction fails clearly if a real GPU surface is required and absent. |
| Canvas-only app | `@royal/vanilla` and `@royal/react/root` expose imperative roots that do not require ReactDOM. | Backend root accepts a canvas-like surface and does not care which framework found it. |
| No ReactDOM | `@royal/react/root` must not import `react-dom/client`. `<Canvas>` may use React, but root creation does not. | No special case. |
| Event dispatch | Adapter maps React synthetic events, Solid DOM events, or vanilla events into `RoyalInputEvent`. | Core/backend never store framework event objects. Picking services consume normalized events. |
| Cleanup and lifetimes | Adapter unsubscribes stores/signals, cancels scheduled renders, detaches listeners, and calls `dispose()` once. | Backend `dispose()` is idempotent and releases GPU/cache resources. Async asset callbacks check mounted state. |
| Scheduler differences | React uses layout/effect timing, Solid uses fine-grained subscriptions, vanilla may use RAF/manual/microtask. Adapters coalesce. | Backend root accepts complete snapshots or patch lanes and does not assume React commit timing. |
| OffscreenCanvas | Vanilla or backend adapter owns worker protocol and message scheduling. Framework adapters pass scene sources across a boundary. | GPU resources live on the worker/backend side. |
| XR/multiview | Adapter can expose session controls, but view scheduling is a backend/runtime concern. | Core cannot assume one canvas, one mono camera, or one frame clock. |

## Capabilities And Feature Gates

Capabilities should be rows that can be inspected by apps and Tarstate without
leaking browser or GPU handles:

```ts
export interface RoyalCapabilityRow {
  readonly feature: string;
  readonly owner: 'adapter' | 'backend' | 'core' | 'lens';
  readonly status: 'available' | 'unavailable' | 'emulated' | 'unknown';
  readonly stage: 'stable' | 'prototype' | 'future';
  readonly reason?: string;
}
```

Feature ownership:

| Feature | Primary owner | Adapter API |
| --- | --- | --- |
| React JSX runtime | `@royal/react` | `@royal/react/jsx-runtime` |
| Solid components/signals | `@royal/solid` | `Canvas`, scene memo/source helpers |
| Vanilla/manual scheduling | `@royal/vanilla` | `createRoot`, schedulers |
| Vector text | renderer-core data plus backend text module | capability row and text node support |
| Texture atlas | asset/cache package plus backend uploads | capability row, no JSX-specific API |
| HZB/software occlusion | visibility service plus backend resources | capability rows and probe rows |
| GPU pick | picking service plus backend ID/depth pass | normalized event dispatch and pick result rows |
| WebGL2/WebGPU | backend package | capability rows and root construction options |
| Tarstate rows | `@royal/tarstate-lens` | generic external scene source |

Future rendering features should be construction-time backend modules where
possible. Adapters may expose a readable capability surface:

```ts
const capabilities = root.capabilities();
const gpuPick = capabilities.find((row) => row.feature === 'gpu-pick');
```

Do not put feature modules into renderer-core merely because React, Solid, and
vanilla all need to observe them. Shared observation is a capability-row
contract, not ownership by core.

## Migration Notes

1. Add the adapter contract in place while `react-regl-fiber` still exists.
   Decomplection check: document current imports and keep behavior unchanged.

2. Rename the canonical React package to `@royal/react` in the Royal monorepo.
   Keep the current JSX intrinsic vocabulary and `createRoot` shape.
   Decomplection check: package rename only; no renderer behavior changes.

3. Add `react-royal-fiber` as an alias package after `@royal/react` builds.
   Decomplection check: alias has no source of truth.

4. Introduce `@royal/vanilla` around the imperative root contract.
   Decomplection check: canvas-only apps stop importing a React-named root.

5. Add `@royal/solid` with component/source helpers first, then decide whether
   a Solid JSX intrinsic runtime is worth supporting.
   Decomplection check: do not contort renderer-core for Solid compiler needs.

6. Keep `@royal/tarstate-lens` as a generic scene source provider.
   Decomplection check: no framework, DOM, WebGL, or backend handles in lens
   APIs.

## Recommendation

Stabilize the adapter boundary around these contracts:

- canonical React package: `@royal/react`
- compatibility alias: `react-royal-fiber`
- framework-free root package: `@royal/vanilla`
- future Solid package: `@royal/solid`
- core input: `RenderRoot` snapshots first, patch lanes later
- state input: generic external scene sources, not Tarstate-specific core APIs
- feature visibility: capability rows owned by adapters, backend modules, or
  lenses, not hidden globals

That path keeps renderer-core stable while leaving room for React JSX,
Solid-native signals, canvas-only apps, headless tests, workers, XR, GPU pick,
HZB, atlas, and future backend modules.
