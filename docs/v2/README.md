# Patchpit V2 Docs

This directory owns the living v2 design work. The `v1` branch preserves the
pre-v2 implementation; `main` is now the v2 monorepo stub.

## Start Here

- `research/patchpit-v2-stage-zero.md`: stage-zero review and research index.
- `patchpit-v2-stub-spec.md`: first scoped build target for `main`.
- `research/app-shortcut-instance-brief.md`: app shortcut, app ref, and app
  instance model.
- `research/filesystem-runtime-shape-brief.md`: data placement, runtime
  namespace, and possible future terminal acceptance slice.
- `research/browser-resource-requirements.md`: browser storage, eviction, and
  performance requirements for future shell/chargrid/3D/terminal work.
- `research/automerge-js-benchmark-plan.md`: Automerge JS/WASM benchmark
  direction before considering workload-specific CRDT experiments.
- `research/network-sync-test-plan.md`: deterministic fake-network sync test
  direction before Sedimentree/Beelay transport integration.
- `research/tarstate-api-brief.md`: Tarstate API critique and future-compatible
  posture.
- `tarstate-api-sketch.md`: proposed functional v2 API shape, edge cases, and
  day-one proof gates.

## Monorepo Baseline

The v2 root follows Royal's boring monorepo setup where it applies:

- private ESM root package
- pinned pnpm package manager
- Node 24 engine floor
- `pnpm-workspace.yaml` with catalog versions
- strict root TypeScript config
- root `typecheck`, `test`, `lint`, and shell `build` scripts
- claims scripts kept at the root

Intentional differences from Royal:

- Patchpit has a Vite shell smoke app, but no final runtime UI yet.
- Patchpit keeps `apps/*` and `packages/*` in the workspace globs, but only
  creates reusable packages after their boundaries have been proven.

## Next Session

1. Restore a small `packages/tarstate` day-one slice from
   `tarstate-api-sketch.md`.
2. Prove durable workspace rows joined to ephemeral presence rows through tests,
   including one composed-source fixture and one permission/visibility
   diagnostic fixture.
3. Then use that query boundary while defining app shortcut, app ref, and app
   instance data.
