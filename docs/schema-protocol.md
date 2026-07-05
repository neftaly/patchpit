# Patchpit Schema Protocol

Patchpit state surfaces should be self-describing without making schemas part
of normal state churn. A schema is a stable protocol header for relation-shaped
data. State updates carry `schemaId` and data; durable documents carry a schema
ref, and snapshots may carry the descriptor when the receiver cannot resolve it
from a catalog.

This document defines the portable descriptor format used by durable Automerge
docs, runtime projections, intents, realtime/presence streams, and diagnostic
state.

## Goals

- Let apps, runtimes, agents, and tools discover how to read and write a state
  surface without importing the app's TypeScript.
- Keep schemas JSON-compatible and structured-clone compatible.
- Make ordinary state updates avoid schema churn.
- Use one relation schema shape for durable state, derived projections,
  ephemeral presence, failure state, and intent payloads.
- Preserve Patchpit's existing rule that Automerge docs remain canonical while
  Tarstate provides relation lenses over them.

## Non-Goals

- Do not embed executable validators, closures, or TypeScript-only objects in
  documents or worker messages.
- Do not define the first stable Tarstate relation patch operation vocabulary.
- Do not require fully portable Automerge-to-relation lenses in V0.
- Do not use JSON Schema as the primary protocol.
- Do not make schemas a substitute for policy, capability grants, or runtime
  scope checks.

## Descriptor Format

The descriptor is Tarstate's canonical `SchemaManifestV1` JSON data. Unknown
top-level fields are invalid. Fields whose value would be `false`, `undefined`,
or empty should be omitted.

```ts
type PatchpitSchemaId = string;
type PatchpitSchemaHash = `sha256:${string}`;
type PatchpitSchemaUrl = string;
type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

type PatchpitSchemaRef = {
  id: PatchpitSchemaId;
  hash?: PatchpitSchemaHash;
  url?: PatchpitSchemaUrl;
};

type PatchpitSchemaAttachment = PatchpitSchemaRef & {
  descriptor: PatchpitRelationSchemaDescriptor;
};

type PatchpitRelationSchemaDescriptor = SchemaManifestV1;

type SchemaManifestV1 = {
  kind: 'tarstate.schema';
  formatVersion: 1;
  schemaId: PatchpitSchemaId;
  description?: string;
  relations: Record<string, RelationManifestV1>;
  codecs?: Record<string, CodecDeclarationV1>;
  metadata?: JsonObject;
};

type RelationManifestV1 = {
  key: string | readonly string[];
  fields: Record<string, FieldManifestV1>;
  ephemeral?: true;
  description?: string;
  metadata?: JsonObject;
};

type CodecDeclarationV1 = {
  description?: string;
  scalar?: 'string' | 'number' | 'boolean' | 'null';
  keyable?: boolean;
  metadata?: JsonObject;
};

type FieldManifestV1 =
  FieldBaseV1 & (
    | { type: 'string' | 'number' | 'boolean' | 'json' | 'anchoredPath' }
    | { type: 'id'; domain: string }
    | { type: 'ref'; target: { relation: string; field: string } }
    | { type: 'custom'; codec: string }
  );

type FieldBaseV1 = {
  optional?: true;
  nullable?: true;
  description?: string;
  metadata?: JsonObject;
};

type FieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'id'
  | 'ref'
  | 'anchoredPath'
  | 'custom';
```

`PatchpitSchemaId` uses the existing Patchpit versioned id style:

```txt
patchpit.filesystem.tree@1
patchpit.intent.route@1
patchpit.app.filePicker.state@1
patchpit.presence.clients@1
patchpit.runtime.failures@1
```

`hash` is the lowercase hexadecimal SHA-256 hash of the descriptor's canonical
JSON form, written as `sha256:<64 lowercase hex characters>`. Canonical JSON
means UTF-8 JSON with object keys sorted by JavaScript string code-unit order,
no insignificant whitespace, array order preserved, and only finite JSON
numbers. The descriptor does not include its own hash.

`url` points at the schema location. Today system-owned schemas use a source
catalog URL such as
`package:@patchpit/system/src/filesystem/schemas.ts#patchpit.app.filePicker.state@1`.
A durable `/system/schemas` location can be added later without changing refs.

## Relation Semantics

The descriptor describes the public relation view of a state surface, not
necessarily the physical Automerge document layout. A file-picker state doc can
store `openFolders` as a map while exposing an `openFolders` relation. A
terminal state doc can store `lines` as an array while exposing a `lines`
relation keyed by `(stateId, position)`.

This keeps domain documents ergonomic without making the protocol opaque.

Tarstate v1 distinguishes durable/default relations from `ephemeral` relations.
Durable/default relations omit `ephemeral`. Session-local relations set
`ephemeral: true`. Extra Patchpit lifecycle meaning, such as derived views or
indexes, belongs in `metadata` or projection ownership, not in a custom
relation-lifetime field.

`json` fields are allowed for intentionally open payloads. Core protocol
surfaces should prefer scalar fields and additional relations over large JSON
blobs. `custom` fields are a last resort for values that cannot be understood
without a named app/runtime convention.

Kind-specific metadata must make fields self-describing:

- `id` fields must declare `domain`.
- `ref` fields must declare `target`.
- `custom` fields must declare `codec`, and the schema must declare that codec.
- `domain`, `target`, and `codec` must not appear on unrelated field kinds.

## Where Schemas Travel

Durable Patchpit docs embed the primary schema ref in `@patchpit`. Normal state
updates do not touch this field. State docs should not duplicate descriptor
bodies when the descriptor is available from a source or durable catalog.

```ts
type PatchpitDocMetadata<T extends string> = {
  type: T;
  suggestedImportUrl?: string;
  schema?: PatchpitSchemaRef;
  schemas?: Record<PatchpitSchemaId, PatchpitRelationSchemaDescriptor>;
};
```

Example:

```ts
{
  '@patchpit': {
    type: 'file-picker-state',
    schema: {
      id: 'patchpit.app.filePicker.state@1',
      hash: 'sha256:...',
      url: 'package:@patchpit/system/src/filesystem/schemas.ts#patchpit.app.filePicker.state@1'
    }
  },

  activeUrl: 'automerge:...',
  openFolders: {},
  selectedUrls: []
}
```

App manifests advertise the schemas an app expects or creates. The state doc
still embeds its own schema so copied/imported data remains self-describing.

```ts
type AppManifest = {
  manifestVersion: 1;
  id: string;
  name: string;
  entry: string;
  schemas?: Record<PatchpitSchemaId, PatchpitRelationSchemaDescriptor>;
  surfaces?: SurfaceSpec[];
};

type SurfaceSpec = {
  role: SurfaceRole;
  state?: {
    type: string;
    schema?: PatchpitSchemaRef;
  };
};
```

Runtime projection snapshots attach the descriptor on the snapshot/reset path.
Patches carry only schema identity.

```ts
type ProjectionSnapshot = {
  subscriptionId: string;
  projection: string;
  schemaId: PatchpitSchemaId;
  schemaHash?: PatchpitSchemaHash;
  schema?: PatchpitRelationSchemaDescriptor;
  basis: ProjectionBasis;
  storageHeads?: AutomergeHeadSet;
  lensPath?: string[];
  relations: RelationSet;
};

type RelationPatch = {
  schemaId: PatchpitSchemaId;
  format: 'tarstate.relationPatch@unstable';
  ops: readonly Json[];
};
```

Intent inputs keep their current `schemaId`; descriptors are discovered from the
runtime, app manifest, or related document before the request is sent.

Realtime capability grants may include descriptors for topics the grant permits.
Individual realtime messages carry `schemaId` only when their `data` is a
relation set or relation patch.

```ts
type CapabilityGrant = {
  capabilityId: string;
  capability: CapabilityName;
  verbs: readonly string[];
  bounds?: CapabilityBounds;
  schemas?: Record<PatchpitSchemaId, PatchpitRelationSchemaDescriptor>;
};

type RealtimeMessage = {
  topic: string;
  mode: 'replace-latest' | 'append-bounded';
  ttlMs: number;
  key?: string;
  schemaId?: PatchpitSchemaId;
  data: Json;
};
```

Protocol-level `RuntimeError` remains the fallback error shape for failures
that happen before a schema can be decoded. Inspectable or subscribable failure
state should use a normal relation schema such as
`patchpit.runtime.failures@1`.

## File Picker Example

The public relation schema should avoid leaking the raw document's nested map
and array shape where a better relation protocol is obvious.

```ts
const filePickerStateSchema = {
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.app.filePicker.state@1',
  description: 'Durable file picker state',
  relations: {
    state: {
      key: 'id',
      fields: {
        id: { type: 'id', domain: 'filePickerState' },
        rootUrl: { type: 'string' },
        fileTypesUrl: { type: 'string' },
        activeUrl: { type: 'string', optional: true }
      }
    },
    openFolders: {
      key: ['stateId', 'url'],
      fields: {
        stateId: { type: 'ref', target: { relation: 'state', field: 'id' } },
        url: { type: 'string' },
        open: { type: 'boolean' }
      }
    },
    selections: {
      key: ['stateId', 'position'],
      fields: {
        stateId: { type: 'ref', target: { relation: 'state', field: 'id' } },
        position: { type: 'number' },
        url: { type: 'string' }
      }
    }
  }
} satisfies PatchpitRelationSchemaDescriptor;
```

The current Automerge document can still store:

```ts
{
  rootUrl: string;
  fileTypesUrl: string;
  activeUrl?: string;
  openFolders: Record<string, boolean>;
  selectedUrls: string[];
}
```

The app/runtime owns the lens between that document shape and the relation
schema.

## Presence Example

Presence is ephemeral. It should not be forced into Automerge just to satisfy
the schema model.

```ts
const presenceClientsSchema = {
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.presence.clients@1',
  relations: {
    clients: {
      key: 'clientId',
      ephemeral: true,
      fields: {
        clientId: { type: 'id', domain: 'runtimeClient' },
        workspaceId: { type: 'string' },
        subjectId: { type: 'string', optional: true },
        appId: { type: 'string', optional: true },
        surfaceId: { type: 'string', optional: true },
        contextId: { type: 'string', optional: true },
        status: {
          type: 'string',
          metadata: { values: ['active', 'idle', 'offline'] }
        },
        lastSeenAt: { type: 'number' }
      }
    }
  }
} satisfies PatchpitRelationSchemaDescriptor;
```

## Failure State Example

Protocol envelope failures still use `RuntimeError`. Failure state that users,
agents, or developer tools inspect can be a derived relation.

```ts
const runtimeFailuresSchema = {
  kind: 'tarstate.schema',
  formatVersion: 1,
  schemaId: 'patchpit.runtime.failures@1',
  relations: {
    failures: {
      key: 'id',
      metadata: { patchpit: { lifecycle: 'derived' } },
      fields: {
        id: { type: 'id', domain: 'runtimeFailure' },
        code: { type: 'string' },
        message: { type: 'string' },
        source: {
          type: 'string',
          metadata: { values: ['runtime', 'worker', 'capability', 'projection', 'intent'] }
        },
        subjectUrl: { type: 'string', optional: true },
        recoverable: { type: 'boolean' },
        details: { type: 'json', optional: true }
      }
    }
  }
} satisfies PatchpitRelationSchemaDescriptor;
```

## Code Locations

The implementation should land in these places:

- `packages/system/src/schema.ts`: portable descriptor types, canonical JSON
  hashing, and small helpers.
- `packages/system/src/filesystem/schemas.ts`: canonical system schema catalog,
  source-location refs, hashes, and doc-type metadata helpers for current
  Patchpit-owned docs.
- `packages/system/src/filesystem/types.ts`: `PatchpitDoc['@patchpit']`
  metadata gains `schema` and `schemas`; `AppManifestDoc` gains `schemas`;
  `SurfaceSpec.state.schema` becomes `PatchpitSchemaRef`.
- `packages/system/src/runtime/protocol.ts`: projection snapshots and capability
  grants gain optional schema descriptors and schema hashes.
- Seed data in `packages/system/src/filesystem/seed.ts` embeds schema refs in
  durable docs and lets app manifests advertise descriptor registries for state
  docs they create. State docs keep refs only.

V0 can use registered app/runtime lenses to project hierarchical Automerge docs
into these relations. Fully portable lens descriptors can come later without
changing the schema header format.
