# Research Paper Corpus

This folder stores local copies of papers that are useful enough to keep near
the v2 research notes. Prefer adding papers here only when they change a
question, proof gate, benchmark, or source-adapter shape.

## Direction Check

These papers do not require a major goal change. The current direction still
holds:

- Patchpit remains a document-backed workspace OS.
- Tarstate remains a query/write algebra candidate, not an OS primitive yet.
- Royal/renderer v2 remains a small renderer and scene-source pipeline, not a
  general game engine, Three.js clone, or neural rendering runtime.

The papers do sharpen the research agenda:

- Treat generated worlds, splats, and simulator assets as source adapters with
  explicit cursors, cache keys, feature windows, and proof scenes.
- Add block/submap/semantic scene representations to the renderer corpus without
  moving them into renderer core.
- Keep random-access, teleport, time-to-first-tile, and time-to-next-tile style
  latency as first-class streaming metrics.
- Keep CRDT move, undo/redo, schema evolution, and representation-independence
  work as pressure on Patchpit document identity and Tarstate write boundaries.
- Prefer benchmark/proof updates over broad dependency changes.

## Renderer And Source-Adapter Papers

| Paper | Local PDF | Source | Corpus Use |
|---|---|---|---|
| InfiniteDiffusion / Terrain Diffusion | `2512.08309-infinitediffusion-terrain-diffusion.pdf` | https://arxiv.org/abs/2512.08309 | Seed-consistent, random-access infinite terrain generation; streaming source-adapter proof pressure. |
| WorldGrow: Generating Infinite 3D World | `2510.21682-worldgrow.pdf` | https://arxiv.org/abs/2510.21682 | Expandable 3D world blocks, growth cursors, and coarse-to-fine scene generation. |
| WorldGen: From Text to Traversable and Interactive 3D Worlds | `2511.16825-worldgen.pdf` | https://arxiv.org/abs/2511.16825 | Text/procedural/diffusion pipeline for traversable game-engine-ready worlds. |
| Infinigen-Sim: Procedural Generation of Articulated Simulation Assets | `2505.10755-infinigen-sim.pdf` | https://arxiv.org/abs/2505.10755 | Extends Infinigen-style source generation into articulated assets and simulator metadata. |
| TraGraph-GS: Trajectory Graph-based Gaussian Splatting for Arbitrary Large-Scale Scene Rendering | `2506.08704-tragraph-gs.pdf` | https://arxiv.org/abs/2506.08704 | Large-scale splat submaps, graph partitioning, and progressive rendering. |
| SceneSplat++: A Large Dataset and Comprehensive Benchmark for Language Gaussian Splatting | `2506.08710-scenesplat-plus-plus.pdf` | https://arxiv.org/abs/2506.08710 | Semantic/language-indexed splat dataset and benchmark pressure for source adapters. |

## Patchpit, Tarstate, And CRDT Papers

| Paper | Local PDF | Source | Corpus Use |
|---|---|---|---|
| A Datalog Framework for Conflict-Free Replicated Data Types | `2605.31569-datalog-framework-for-crdts.pdf` | https://arxiv.org/abs/2605.31569 | Declarative CRDT semantics and a useful Tarstate/LoRe neighborhood signal. |
| Living Databases: A Unified Model for Continuous Schema Evolution, Versioning, and Transformations | `2605.00676-living-databases.pdf` | https://arxiv.org/abs/2605.00676 | Schema evolution, provenance, derived objects, and syncable database substrate pressure. |
| Introducing Support for Move Operations in Melda CRDT | `2503.04811-melda-crdt-move-operations.pdf` | https://arxiv.org/abs/2503.04811 | Move semantics for JSON/tree-like replicated documents. |
| CRDT Emulation, Simulation, and Representation Independence | `2504.05398-crdt-emulation-simulation-representation-independence.pdf` | https://arxiv.org/abs/2504.05398 | Representation-independence checks for swappable sync/CRDT layers. |
| Undo and Redo Support for Replicated Registers | `2404.11308-undo-redo-replicated-registers.pdf` | https://arxiv.org/abs/2404.11308 | Collaborative undo/redo semantics for local-first authoring tools. |
