# Patchpit artifacts

Patchpit's logical schema bodies, storage mappings, document declarations, and
typed FRelP constraints are authored in [`source`](./source).

Run `pnpm artifacts:build` after changing any source. Tarstate writes the
canonical portable bundle and exact relation bindings under `src/generated`.
Do not edit those generated files. `pnpm typecheck` runs
`pnpm artifacts:check` and rejects stale outputs.

Application code imports artifacts, declarations, relations, and inferred row
types from `@patchpit/artifacts`. It does not seal or compile artifact sources
at runtime.
