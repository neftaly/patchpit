# @patchpit/fs

`@patchpit/fs` exposes filesystem placement and file-document meaning as exact
Tarstate schemas. Storage adapters own physical documents and source lifecycle.

## Relation

The sealed `patchpit.fs.entry` relation has these fields:

| Field | Meaning |
| --- | --- |
| `entryId` | Stable logical entry ID and relation key |
| `parentId` | Parent entry ID, or `null` for a root |
| `order` | Integer order among siblings |
| `kind` | `folder` or `file` |
| `name` | Entry name |
| `resourceRef` | Reference to the folder or file resource |

Queries add `sourceId` from Tarstate attachment provenance. Parent traversal is
restricted to entries from that same source.

## Exports

- `fsSchemaArtifact` and `fsEntriesRelation` describe the logical relation;
  `parseFsEntry` parses rows at its boundary.
- `createFsDatabaseSource` adapts an observable source and projection into a
  mountable filesystem database source.
- `createStaticFsDatabaseSource` creates an exact source from an `FsDocument`.
- `openFsEntriesQuery` observes entries across a list of sources.
- `openFsSubtreeQuery` observes one folder and its recursive descendants within
  one source.
- `FsDatabaseSource`, `FsDocument`, `FsEntry`, and `FsEntryRow` are the exported
  public types.
- `fileSchemaArtifact` and `fileRelation` describe logical files with `name`,
  `extension`, `mimeType`, and a discriminated text or binary content branch.
  Storage mappings retain the physical Automerge representation.

`FsDatabaseSource` is deliberately only a Tarstate mount capability. Source and
attachment identities are obtained from its mount lease rather than exposed as
parallel Patchpit state.

Both query functions return an owned Tarstate query session. Consumers read
readiness, completeness, issues, basis, and rows from `getSnapshot()`, may await
`whenSettled()`, and call `close()` when finished.

```ts
import { createStaticFsDatabaseSource, openFsEntriesQuery } from '@patchpit/fs';

const source = createStaticFsDatabaseSource({
  sourceId: 'workspace',
  entries: [
    {
      entryId: 'root',
      parentId: null,
      order: 0,
      kind: 'folder',
      name: 'workspace',
      resourceRef: 'automerge:root',
    },
  ],
});
const query = await openFsEntriesQuery([source]);
const snapshot = query.getSnapshot();
query.close();
```
