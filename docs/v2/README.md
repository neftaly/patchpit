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
- `research/tarstate-api-brief.md`: Tarstate API critique and future-compatible
  posture.

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

1. Review the app host boundary.
2. Define concrete app shortcut, app ref, and app instance data.
3. Use host/namespace tests as the boundary proof: app shortcuts launch through
   the host, runtime instances appear under `/patchpit/run/apps`, and bad data
   becomes diagnostics.

Tarstate can wait until after that unless it blocks the app host shape.
