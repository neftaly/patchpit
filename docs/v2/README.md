# Patchpit V2 Docs

This directory owns the living v2 design work. The `v1` branch preserves the
pre-v2 implementation; `main` is now the v2 Browser/OS/shell monorepo stub.

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
- `research/game-dogfood-stack/`: neutral planning docs for making the first
  game app dogfood the Patchpit monorepo and its `opshop` app.
- `research/malicious-app-capability-harness.md`: hostile-app fixture plan for
  host-call and capability enforcement.
- `research/tarstate-api-brief.md`: Tarstate API critique and future-compatible
  posture.
- `research/tarstate-capability-runtime.md`: Tarstate capability and runtime
  boundary notes.
- `research/tarstate-royal-api.md`: Tarstate/Royal projection boundary.
- `research/prototype-status.md`: current prototype status and cleanup notes.
- `research/papers/README.md`: external research references.
- `tarstate-api-sketch.md`: proposed functional v2 API shape, edge cases, and
  day-one proof gates.

## Monorepo Baseline

The v2 root uses a boring monorepo setup:

- private ESM root package
- pinned pnpm package manager
- Node 24 engine floor
- `pnpm-workspace.yaml` with catalog versions
- strict root TypeScript config
- root `typecheck`, `test`, `lint`, and shell `build` scripts
- claims scripts kept at the root

Current baseline:

- Patchpit has a Vite shell smoke app, but no final runtime UI yet.
- Patchpit keeps `apps/*` and `packages/*` in the workspace globs, but only
  creates reusable packages after their boundaries have been proven.

## Next Session

1. Turn `game-dogfood-stack/first-slice-api.md` into tiny TypeScript contracts
   and tests.
2. Add the neutral workspace/session/assets/bindings fixture from the game
   dogfood docs.
3. Restore the thin React hook adapter around Tarstate once source watching is
   ready.
