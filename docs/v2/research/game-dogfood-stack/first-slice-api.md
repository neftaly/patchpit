# First Slice API

This is a contract sketch, not a final schema. It exists so the first build has
stable names, IDs, and test fixtures.

## Launch

```ts
type DocUrl = `automerge:${string}`
type ViewMode = 'auto' | 'tablet' | 'desktop' | 'spatial'

type PatchpitHashProps = {
  app?: string
  workspace?: DocUrl
  source?: DocUrl | string
  sync?: [string, ...string[]]
  delegation?: string
  view?: ViewMode
}
```

`workspace` opens an existing workspace doc. `source` creates or mounts from a
source/root doc. Do not use `template` at the Patchpit level; game apps may need
that word for their own setup concepts.

## Host SDK

Apps talk to Patchpit through one small host object:

```ts
type PatchpitHost = {
  mount(input: MountInput): Promise<AppMount>
  readConfig(ref: ConfigRef): Promise<unknown>
  patchConfig(patch: ConfigPatch): Promise<void>
  resolveAsset(ref: AssetRef): Promise<ResolvedAsset>
  requestFocus(target: StableTargetId): Promise<void>
  emitInteraction(event: InteractionEvent): Promise<void>
  subscribeDiagnostics(fn: (diagnostic: Diagnostic) => void): () => void
}
```

Apps should not receive raw Automerge, Tarstate, Royal, DOM, iframe, worker, or
browser handles.

## Runtime Rows

```ts
type StableTargetId = string

type AppRef = {
  id: string
  kind: 'app'
  source: DocUrl | string
}

type AppInstance = {
  id: string
  appRef: string
  workspace: DocUrl
  status: 'starting' | 'ready' | 'failed'
}

type AppMount = {
  id: string
  instance: string
  role: 'workspace' | 'session' | 'tool' | 'asset'
  targetDoc?: DocUrl
  config?: ConfigRef
}

type Surface = {
  id: string
  mount: string
  mode: ViewMode
  target: StableTargetId
}
```

## Host Calls

```ts
type HostDecision = {
  requestId: string
  subject: string
  action: string
  resource: string
  allowed: boolean
  reason?: string
}

type Diagnostic = {
  id: string
  level: 'info' | 'warning' | 'error'
  code: string
  message: string
  target?: StableTargetId
}
```

V1 can allow everything, but every host call still records a decision. That
keeps the future auth/delegation seam real.

Tests should keep one synthetic deny path so diagnostics and UI states exist
before real auth arrives.

## Fixture

The first fixture should include:

- one workspace doc
- one session doc
- one assets doc or folder doc
- one bindings doc
- one mounted tool/config patch
- one synthetic denied-call diagnostic, even if production v1 allows all
