# @patchpit/fs

`@patchpit/fs` is the logical folder and file boundary. Physical Automerge
shapes belong to `@patchpit/automerge-fs`; this package contains Tarstate
schemas, graph queries, and semantic link operations.

## Folder model

Each source contributes one `patchpit.folder` row and an ordered
`patchpit.folder.link` relation. A link has source-local `linkId`, optional
source-derived `order`, placement `name`, non-authoritative `typeHint`, and a
durable `resourceRef`. Query rows add the containing folder's `sourceId` from
Tarstate provenance. Duplicate occurrences remain separate rows. Reusing a
`resourceRef` under another name is a valid alias rather than a path conflict.

`openFolderGraphQuery` follows links whose type hint is `folder`. Discovery is
bounded, authority-scoped, cycle-safe, and retains unavailable or invalid
sources as evidence. It never turns a missing folder into an empty one.
The focused folder and file title queries project document-owned titles without
using placement names as durable document metadata.

Owned sources can apply `folder.link.rename`, `folder.link.unlink`, and
`folder.link.alias` with `commitFolderOperation`. Reordering remains a distinct
source-native identity-preserving move capability and is not emulated with
delete/reinsert or private journal semantics.

The separate exact file relation describes logical text or binary content.
Storage mappings retain each physical representation and its write capability.

```ts
import { createStaticFolderDatabaseSource, openFolderGraphQuery } from '@patchpit/fs';

const root = createStaticFolderDatabaseSource({
  sourceId: 'folder:root',
  title: 'Root',
  links: [{
    linkId: 'readme',
    name: 'readme.md',
    order: 0,
    resourceRef: 'document:readme',
    typeHint: 'file',
  }],
});
const query = await openFolderGraphQuery({ root, openSource: () => undefined });
const snapshot = await query.whenSettled();
query.close();
```
