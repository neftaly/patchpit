# Infinigen To Node Tech Demo Plan

This is a local planning checkpoint for turning Infinigen-generated scenes into
a credible node/web game-engine demo without making Infinigen part of the
runtime. It is intentionally scoped to Royal renderer research paths and avoids
storefront, chargrid, tarstate, and package manifest churn.

## Current Repo Fit

Royal already treats Infinigen as a scene source adapter, not as renderer
architecture. The v2 renderer target says streaming should feed:

```txt
SceneSource -> ScenePatchBatch -> SceneState -> RenderPlan -> GPU executor
```

That is still the right shape. The Infinigen-specific work should produce scene
packages and source adapters that emit ordinary static assets, instance
columns, and scene patch lanes. It should not define renderer patch boundaries,
transport windows, or a separate Infinigen renderer path.

Existing repo pressure:

- `packages/renderer-core` has primitive and glTF authoring nodes.
- `packages/react-regl-fiber` has a v1 WebGL path with current glTF support and
  known future gaps around richer materials, animation, and instancing.
- `docs/royal/renderer-v2-target-architecture.md` already names
  `streaming/Infinigen scene source` as a proof scene.
- `docs/royal/dependency-research.md` already defers loader dependencies until
  implementation pressure exists.

## Upstream Constraints

Infinigen is Blender-based, procedural, and optimized for generating vision
research data rather than real-time game packages. Its current public docs say
external export bakes procedural assets/materials into static meshes and
texture maps before invoking Blender exporters. The docs list OBJ, FBX, STL,
PLY, and USDC exports. Full Infinigen scenes are only supported for USDC because
large scenes use instancing; non-instancing formats realize each scatter
instance into copied geometry, which can explode memory and asset size.

Practical implications:

- Treat `.blend` and `.usdc` as offline conversion inputs.
- Do not use OBJ/FBX/PLY for full-scene conversion except tiny diagnostics.
- Preserve prototypes plus transform arrays as first-class package data.
- Expect material loss: exporter support is mainly albedo, roughness, normal,
  and metallic maps; transparency, transmission, clearcoat, sheen, skin,
  leaves, water, lava, volumetrics, particles, and animation need explicit
  fallback policy.
- Use individual-asset generation for early isolated props, but require USDC for
  the full fancy scene story.

Sources:

- https://infinigen.org/
- https://github.com/princeton-vl/infinigen
- https://github.com/princeton-vl/infinigen/blob/main/docs/ExportingToExternalFileFormats.md
- https://github.com/princeton-vl/infinigen/blob/main/docs/GeneratingIndividualAssets.md
- https://github.com/princeton-vl/infinigen/blob/main/docs/HelloRoom.md

## Conversion Format

Use a Patchpit scene package, not raw glTF as the whole scene format.

Recommended package layout:

```txt
scene.package.json
assets/
  prototypes/
    cabinet.glb
    sink.glb
    plant_a.glb
  textures/
  buffers/
    transforms.f32.bin
    bounds.f32.bin
source/
  seed.json
  infinigen-command.txt
  export-report.json
preview/
  thumbnail.webp
```

`scene.package.json` should be a stable JSON manifest. It names unique asset
prototypes, material features, instance groups, transform buffer ranges, bounds,
LOD policy, provenance, and known lossy conversion warnings. The companion
example in `docs/royal/infinigen-node-manifest.example.json` sketches the first
shape.

Why not only glTF:

- glTF can represent instancing through extensions, but this repo needs
  renderer planning, interest policy, streaming lanes, and transform column
  transport independent of a loader's scene graph.
- A manifest lets the converter use glTF/GLB for unique prototype assets while
  keeping mass instance placement in renderer-friendly columns.
- The same package can feed local loading, worker loading, and future
  WebTransport streaming without changing source identity.

Minimum records:

- `prototypes`: stable asset ids, GLB URL, content hash, local bounds, material
  feature summary, and fallback tags.
- `instanceGroups`: prototype id, count, transform encoding, transform byte
  range, optional per-instance color/variation range, group bounds, static or
  dynamic lane.
- `materials`: texture URLs, resolution, color space, alpha mode, double-sided
  flag, and unsupported features dropped during bake.
- `source`: Infinigen repo commit or release, seed, command, gin configs,
  export format, bake resolution, converter version.
- `budgets`: total bytes, texture bytes, geometry bytes, instance count, max
  draw groups, recommended desktop/mobile LOD caps.
- `warnings`: lossy or unsupported source features.

## Pipeline

Offline generation:

1. Generate a constrained Infinigen scene or individual assets.
2. Save `.blend` and source provenance.
3. Export full scenes to `.usdc`; export individual diagnostic assets to GLB or
   OBJ only when useful.
4. Bake textures at a known resolution, starting at 1024 for desktop proof and
   512 for mobile proof.

Offline conversion:

1. Inspect USDC hierarchy and collect prototype meshes/materials.
2. Export each unique prototype to GLB.
3. Write columnar transform buffers for instance groups.
4. Compute bounds per prototype and per group.
5. Run optional asset optimization: dedupe, texture resize, mesh simplification,
   quantization, meshopt/Draco only behind explicit demo flags.
6. Emit `scene.package.json`, preview image, conversion report, and warnings.

Node package service:

1. Serve the scene package as static files with byte-range-friendly buffers.
2. Validate manifest shape and content hashes.
3. Provide a development endpoint that maps package data into renderer source
   frames for local Royal examples.

Web runtime:

1. Load the manifest.
2. Fetch prototype GLBs and texture resources through existing glTF/cache
   boundaries.
3. Upload instance transform columns separately from prototype geometry.
4. Emit a `fullSnapshot` for structure and `transformPublication` for
   high-frequency or streaming transform lanes.
5. Measure first nonblank frame, texture readiness, draw lanes, upload time,
   allocation after warmup, and frame time.

Decomplection rule:

- Infinigen conversion owns Blender/USD/provenance complexity.
- Scene package loading owns manifest validation and source frames.
- Renderer owns handles, caches, planning, and GPU submission.
- Interest/transport owns streaming budgets and backpressure.

## Dependencies To Evaluate

Do not install these until a slice needs them.

- Infinigen plus Blender: offline generator/exporter only.
- OpenUSD tooling or Python `usd-core`: inspect USDC prototypes and instance
  transforms.
- Blender Python exporter hooks: fallback path for GLB prototype export when USD
  inspection is not enough.
- glTF-Transform CLI/SDK: optimize GLB prototypes, resize or convert textures,
  dedupe accessors, add meshopt/Draco only for named demo variants.
- `@loaders.gl/gltf`: runtime loader candidate already documented in
  dependency research.
- `@probe.gl/stats`: renderer/package metrics once counters become stable.

Avoid for the first cut:

- A runtime Python/Infinigen dependency.
- Three.js as the engine runtime.
- Flattened OBJ/FBX full scenes.
- Open-ended USD runtime loading in the browser.
- Package-wide manifest/dependency churn before a working converter fixture
  exists.

## First Demo Scope

Target: a single Infinigen Indoors room that feels richer than a normal asset
viewer but remains bounded enough to debug.

Scene:

- Kitchen or living room, single room only.
- Terrain disabled.
- Solver restricted to one room and a small object set.
- One hero object cluster, repeated small props, one or two plants, and baked
  room shell.
- Static lighting to start; optional simple moving camera path.

Acceptance:

- Runs from a local node dev server into the Royal web runtime.
- Shows at least 5 unique prototype GLBs and at least 100 static instances.
- Preserves repeated-object instances as transform columns, not duplicated mesh
  nodes.
- Has a visible package report: source seed, command, sizes, instance count,
  prototype count, dropped material features.
- Can switch between full-quality and capped mobile package variants.
- Emits metrics for first nonblank frame, prototype load time, texture upload
  count/time, draw lanes, and p95 frame time during a scripted camera orbit.

Fallback scope if USDC extraction blocks:

- Use `generate_individual_assets.py` to make 5 to 10 baked props.
- Build a synthetic manifest with repeated transform columns.
- Document the gap as "prototype asset path proven, full-scene USD hierarchy
  extraction pending" instead of pretending the full conversion is complete.

## Risks

- Asset size: real geometry and baked textures can dwarf typical web assets.
  Mitigation: scene budgets, texture caps, GLB optimization, package variants,
  and early size reports.
- Instancing: flattening full scenes destroys viability. Mitigation: make
  prototype-plus-transform extraction the first hard gate.
- Materials: procedural features do not round-trip. Mitigation: record dropped
  features, start with opaque PBR-like materials, and put translucent/water/skin
  into explicit later fixtures.
- Procedural parameters: after baking, many source controls are gone.
  Mitigation: store seed/config/provenance and expose package variants rather
  than runtime procedural editing.
- USD tooling: USDC inspection and prototype extraction may be awkward in Node.
  Mitigation: keep the converter offline and allow a Python helper if it emits a
  plain package manifest and assets.
- Renderer readiness: current glTF path is useful but not the final v2 path.
  Mitigation: use this demo to pressure asset/cache/instancing boundaries, not
  to freeze the v1 loader design.
- CI and reproducibility: Infinigen generation is heavy and hardware-sensitive.
  Mitigation: check in a tiny manifest fixture and generated reports, not giant
  assets; keep large assets outside git or in a documented artifact store.

## What Should Land

Slice 1, docs and fixtures:

- This plan.
- A manifest example and JSON schema or TypeScript validator.
- One tiny hand-authored package fixture using existing DamagedHelmet or simple
  primitive GLBs to prove manifest loading without Infinigen.

Slice 2, offline converter prototype:

- `packages/infinigen-scene-package` or `packages/scene-package` with pure
  manifest types and validation.
- A CLI that reads an exported package directory and reports budgets.
- A converter spike under a new disjoint path, likely
  `tools/infinigen-converter`, only after checking claims.

Slice 3, Royal runtime demo:

- A new Royal example page that loads a package manifest.
- Instance group support that bypasses React reconciliation for transforms.
- Metrics wired into the existing trace summary shape without mixing transport,
  interest, and renderer counters.

Slice 4, real Infinigen proof:

- Local generated package outside git plus a small committed report.
- Screenshots or hardware profile artifacts referenced from docs.
- Acceptance notes against the benchmark plan's `streaming-infinigen` scenario.

Do not push or publish generated assets until storage, licensing, and artifact
size policy are explicit.
