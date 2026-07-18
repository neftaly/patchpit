# Patchpit

Patchpit is a browser shell for trusted HTML apps sharing an
Automerge-backed filesystem. It projects an app folder into an immutable file
snapshot, stores that snapshot in Cache Storage, and launches it through a
same-origin service-worker mount so normal relative HTML, CSS, and module URLs
work.

The current same-origin app profile is for trusted plugins. See
[`packages/sandbox/SECURITY.md`](packages/sandbox/SECURITY.md) for its boundary.

Current product behavior, architecture, testing policy, and future work are
indexed in [`docs/`](docs/README.md).

## Apps

A filesystem folder is launchable when it contains a direct `index.html` file.
The folder is the immutable app snapshot root and `index.html` is its entry;
individual files remain available to the raw inspector. Patchpit does not
require an app manifest for this profile.

The `sandbox-compat` app is the executable supported-profile target. Builds
ship it as separate static files under `__patchpit/apps/sandbox-compat/` rather
than embedding its bytes in the shell JavaScript. The memory-only browser host
imports that artifact when it creates its demo root, and the browser harness
executes the same built app.

The same demo root contains one `Markdown editor` app folder and its visible
`demo.md`. The app loads that file through its immutable relative mount. It is
currently an input experiment: edits report semantic splices but do not persist.
There is no separate Markdown example page; the browser harness launches it
through the main Patchpit file manager.

The browser prototype supplies deployment-scoped, same-origin BroadcastChannel
replication but no persistent storage or externally configured network adapter.
Root hashes select documents only while a live replica can supply them; durable
reopening begins at the injectable Repo host boundary rather than inside
Patchpit's runtime.

## Code map

- `src/browser/` owns browser-only Repo, service-worker, and demo-seed adapters.
- `src/root/` owns root-document lifecycle and invocation.
- `src/content/` projects filesystem resources and renders resource, viewer, and
  sandbox-app content.
- `src/workspace/` owns the durable model, per-client view state, action planning,
  relational document boundary, and workspace view.
- `packages/fs/` is the Tarstate filesystem relation and query boundary.
- `packages/automerge-fs/` attaches canonical Automerge filesystem documents.
- `packages/sandbox-fs/` creates immutable, authority-scoped app snapshots.
- `packages/sandbox/` mounts those snapshots behind the browser sandbox boundary.
- `tests/` separates behavior examples, generated fuzz properties, lifecycle
  integration, and browser behavior.
- `docs/` contains the current behavior and architecture specifications plus
  future work.

## Development

Prerequisites: Node `>=24.12.0`, `pnpm@10.33.2`, and Chromium for the browser
harnesses.

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm typecheck
pnpm lint
pnpm test:behavior
pnpm test:fuzz
pnpm test:integration
pnpm test
pnpm test:dev
pnpm test:markdown-editor
pnpm test:preview
```

Behavior tests exercise functional cores with named examples. Fuzz tests combine
related invariants into generated, shrinking state-machine properties.
Integration tests are the smaller isolated set that owns Repo, source, Node, or
other lifecycle boundaries. Use the focused commands for the development loop;
`pnpm test` runs all three layers.

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium` when Chromium is not at
`/usr/bin/chromium`.

`pnpm build` produces the static site in `dist`, including the sandbox service
worker and demo app artifacts. Set `PATCHPIT_BASE` for a subpath deployment:

```sh
PATCHPIT_BASE=/patchpit/ pnpm build
```

The Pages workflow runs typecheck, lint, Node tests, both browser behavior
harnesses, and a `/patchpit/` production build before uploading `dist` to
GitHub Pages.

Workspace packages export TypeScript source. Direct Node imports use the repo
loader:

```sh
node --import ./tests/support/register-ts-loader.mjs your-script.mjs
```
