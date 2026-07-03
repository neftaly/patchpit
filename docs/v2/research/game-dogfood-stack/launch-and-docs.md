# Launch And Docs

Use small URL handoffs. Put real state and config in docs.

## Launch Shapes

Open a live session/workspace:

```text
opshop.html#{"doc":"automerge:WORKSPACE_DOC","sync":["wss://sync.example"],"delegation":"..."}
```

Create from a source package/root doc:

```text
opshop.html#{"template":"automerge:SOURCE_DOC","sync":["wss://sync.example"],"delegation":"..."}
```

Human-writable shell form:

```text
patchpit.html#app=opshop&doc=automerge:WORKSPACE_DOC&sync=wss://sync.example
patchpit.html#app=opshop&template=automerge:SOURCE_DOC&sync=wss://sync.example
```

## Hash Props

```ts
type PatchpitHashProps = {
  doc?: `automerge:${string}`
  template?: `automerge:${string}` | string
  sync?: [string, ...string[]]
  delegation?: string
  view?: 'auto' | 'tablet' | 'desktop' | 'spatial'
}
```

Rules:

- `doc` opens an existing live workspace/session.
- `template` creates or mounts from source docs.
- `sync` is transport context.
- `delegation` is opaque in v1.
- URL data is handoff context, not durable config.

## Linked Docs

A source/root doc should link layers instead of containing everything:

```jsonc
{
  "@patchpit": { "type": "workspace-source", "version": 1 },
  "title": "Game Workspace",
  "docs": [
    { "name": "workspace", "type": "workspace", "url": "automerge:WORKSPACE_DOC" },
    { "name": "game", "type": "app", "url": "automerge:GAME_APP_DOC" },
    { "name": "session", "type": "data", "url": "automerge:GAME_DOC" },
    { "name": "assets", "type": "folder", "url": "automerge:ASSET_FOLDER_DOC" },
    { "name": "bindings", "type": "bindings", "url": "automerge:BINDINGS_DOC" }
  ]
}
```

Layer docs can include:

- source/project/release docs
- app/module docs
- live workspace docs
- live game/session docs
- asset/file docs
- binding docs
- config rows/docs
- ephemeral presence

## Host Result

Patchpit resolves the handoff into rows:

- `appRefs`
- `appInstances`
- `runtimeContainers`
- `appConfigs`
- `appMounts`
- `sceneObjects`
- `surfaces`
- `pickTargets`
- `interactionEvents`
- `diagnostics`

Formal schemas can wait.
