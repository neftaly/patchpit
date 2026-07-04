# Surface Protocol Review

## Overall

The spec is solid. The authority split (manifest describes, WM owns, apps hold state, clients own viewports) is clean and matches the precedents cited. The Context/Surface/Viewport three-layer model resolves the core problem of "what's running" vs "how it's shown" vs "where it appears on screen." The implementation target is well-scoped.

## Issues

### 1. `Placement` is referenced but never defined

`Viewport.placement?: Placement` — `Placement` doesn't appear in the type model. Fine to defer spatial work, but the field should either be removed until then or typed as `unknown` with a note.

### 2. `Intent.port` is required; `Handler.port` is optional — what's the contract?

If a handler has no `port`, how does it receive intents? The router needs a rule here. Either `port` becomes the discriminant for routing and handlers without one are unreachable, or there's a default port convention that should be stated.

### 3. Context has no durability flag

The spec says previews are "intentionally non-durable unless promoted by `open`." But `Context` has no `ephemeral` field — the distinction is enforced by convention. That means the WM has to track which contexts came from `preview` intents separately. Either add `ephemeral?: boolean` to `Context`, or make it explicit that the WM tracks this out-of-band.

### 4. `SurfaceSpec.state` vs `Context.state` — relationship unclear

`SurfaceSpec.state?: { type: string; schema?: string }` and `Context.state?: string` both seem to reference state docs. The spec doesn't say whether `SurfaceSpec.state` is the surface-level aggregate state (like the WM doc) while `Context.state` is per-app-instance state, or if they overlap. Worth one sentence to distinguish them.

### 5. No surface lifecycle described

The spec defines `Surface` and `SurfaceSpec` but not when surfaces are created or destroyed. The WM owns surfaces — but what triggers creation? Is it always in response to an `open` or `preview` intent? Is there a surface-creation step separate from context routing? The implementation target implies the WM doc is seeded with surfaces, but the runtime lifecycle isn't stated.

### 6. App manifest discovery is unspecified

`AppManifest` defines `handles` so the router can match intents to apps — but the spec doesn't say where manifests live or how the router finds them. The namespace section covers `/srv` for live services but doesn't mention a manifest registry. This is needed before step 1 of the implementation target is actionable.

## Minor

- `ReuseHint = 'source-surface'` — the name is slightly opaque. "Open in the pane that sent the intent" is the obvious reading, but "source-surface" is abstract enough that it could also mean "same surface type." A one-line note would prevent misimplementation.

- `Handler.accepts: string[]` — presumably MIME types or glob patterns (matching the `FileType.match` convention). Worth stating explicitly since `Intent.type` is what gets matched.

## Implementation Target

The 7 steps are in the right order and the deferral of spatial/permissions/multi-viewport is correct. One gap: step 4 ("replace URL-only tabs with contexts") assumes something creates the initial contexts on startup. The spec should say who is responsible for creating bootstrap contexts — probably the seed, but it should be stated.
