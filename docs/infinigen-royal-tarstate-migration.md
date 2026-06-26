# Infinigen Royal + Tarstate Migration

This is the preferred direction for Infinigen rendering work: do not preserve the Three.js viewer architecture. Build a small Royal/Tarstate prototype, benchmark it, then delete the old path once the prototype can cover VR locomotion, terrain, animals, and streamed assets.

## Target Shape

- Tarstate owns scene meaning: terrain chunks, animal poses, resources, cameras, asset handles, visibility cells, and stream lifecycle.
- Royal owns rendering: WebGL buffers, materials, draw ordering, culling, XR frame loop, and GPU resource lifetime.
- Hot loops stay imperative inside Royal. Tarstate should feed compact relation pages into the engine; it should not run per-fragment/per-vertex logic.
- Worker/SAB crossings use binary pages with Tarstate schemas as the semantic wrapper.

## Prototype First

Build `apps/infinigen-royal-prototype` or a feature-flagged alternate entry only after the current viewer proves the stream data shape.

Minimum viable prototype:

1. Read the same Infinigen NDJSON stream.
2. Convert `terrain`, `instance`, and `animalPose` into Tarstate relations.
3. Query visible render rows from Tarstate.
4. Render only three Royal primitive types: terrain mesh, instanced rigid props, and animal marker rigs.
5. Support WebXR left-stick locomotion and snap turn.
6. Show one baked hero GLTF/texture target loaded through Royal.

Success means the prototype is visually comparable while deleting more app-side wiring than it adds.

## Data Relations

Start with scalar, column-friendly relations:

- `terrainChunk(id, chunkX, chunkZ, biome, size, lod, heightPageId, materialId)`
- `instance(id, kind, x, y, z, rx, ry, rz, sx, sy, sz, materialId, assetId)`
- `animalPose(entityId, source, tick, x, y, z, rx, ry, rz, speed, gaitPhase, activity)`
- `visibilityCell(cellId, minX, minZ, maxX, maxZ, lod, priority)`
- `assetPage(assetId, uri, format, byteLength, contentHash)`
- `material(materialId, albedo, roughness, metalness, emissive)`

Keep arrays and objects out of hot relations. Put big payloads in pages and reference them by id.

## Occlusion And Visibility

First practical culling stack:

1. Frustum culling per visibility cell.
2. Distance and LOD budgets per cell.
3. Hierarchical Z / occlusion query experiment in Royal only after cell culling is stable.
4. Optional CPU occluders for terrain ridges and large buildings.

Benchmark culling by draw calls, visible triangles, frame time p95, and camera-motion hitch size.

## Megatextures

Treat megatextures as streamed pages, not materials glued to objects:

- atlas/page id in Tarstate
- binary texture payload cached by service worker or IndexedDB
- Royal uploads visible pages and evicts by priority
- terrain chunks reference page ids, not image URLs directly

First target: one biome terrain atlas with albedo + normal/roughness packed into two textures.

## Blender Hero Bake

Blender is available headless on this machine. A good overnight target is one basalt/fern landmark GLB plus a terrain atlas tile:

- source: generated Blender scene
- output: `assets/infinigen/reference/hero-basalt-fern.glb`
- output: `assets/infinigen/reference/terrain-biome-atlas.png`
- log triangle count, texture dimensions, bake time, and file sizes

Do not make the app depend on Blender at runtime. Blender is an offline bake/reference tool.

## Benchmarks

Required before deleting the old viewer:

- object rows vs Tarstate object rows vs Tarstate binary/SAB page source for `animalPose`
- Three viewer vs Royal prototype frame p50/p95/p99 on desktop
- Quest browser frame stability and first render time
- culling enabled/disabled for draw calls and visible triangles
- texture page upload hitches for megatexture prototype

The win condition is not just higher FPS. It is fewer app-side hand-wired state paths plus lower frame hitches.
