# Archived Terminal Shell Compatibility

This folder preserves the old Terminal shell compatibility implementation and
related reference material from the `archive-terminal-shell-compat` branch at
`bfad292beb314349e589699a399e04cb2ae5d37e`.

It is archived reference, not active Patchpit architecture. Do not wire this
package back into the main app runtime, workspace packages, schema catalog, or
seed filesystem without a new design decision.

Preserved material:

- `apps/terminal/`: Terminal React implementation, filesystem adapter, package
  metadata, tests, and benchmark scripts.
- `docs/terminal-filesystem-capability.md`: the Terminal filesystem capability
  design note that described the old command/filesystem port.
