# @patchpit/fs

`@patchpit/fs` exposes filesystem metadata as a Tarstate relation. It does not
store file bodies or define a nested tree document format.

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

- `fsSchemaArtifact`, `fsEntriesRelation`, and `parseFsEntry` describe and
  validate relation rows.
- `createFsAttachment` adapts an observable source and projection into a
  filesystem attachment.
- `staticFsAttachment` creates an exact attachment from a `FsDocument`.
- `openFsEntries` observes entries across a list of attachments.
- `openFsSubtree` observes one folder and its recursive descendants within one
  attachment.
- `FsAttachment`, `FsDocument`, `FsEntry`, and `FsEntryRow` are the exported
  public types.

`FsAttachment` is deliberately only a Tarstate mount capability. Source and
attachment identities are obtained from its mount lease rather than exposed as
parallel Patchpit state.

Both query functions return `{ observer, close }`. Consumers read readiness,
completeness, issues, basis, and rows from `observer.getSnapshot()` and call
`close()` when finished.

```ts
import { openFsEntries, staticFsAttachment } from '@patchpit/fs';

const attachment = staticFsAttachment({
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
const query = openFsEntries([attachment]);
const snapshot = query.observer.getSnapshot();
query.close();
```
