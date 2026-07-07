# @patchpit/fs draft

Owns filesystem namespace shape only.

## Owns

- `name`
- `kind: 'folder' | 'file'`
- optional `src` reference string
- ordered folder entries
- namespace address identity derived from path
- reusable Tarstate namespace query refs for live views
- tree to rows ingestion
- Tarstate schema for the row/interchange contract

## Does Not Own

- Automerge
- network fetch
- MIME/content decoding
- Patchpit document types
- runtime protocol
- app loading or sandboxing

`id` is the namespace address, not stable object identity. Rename or move
changes `id`.

`src` is inert reference data. When the source has stable identity, such as an
Automerge document URL, that identity lives in `src`. Pinned versions live in
the reference string too, such as `automerge:...#head1|head2`. URL-backed,
data-backed, blob-backed, and relative entries use the same field.

## Source Of Truth

The Tarstate schema in `src/schema.ts` owns the row contract. The package
entrypoint exports only the manifest, inferred row type, reusable path queries,
and tree ingestion transform.

- internal relation: `nodes`
- key: `id`
- ref: `parentId -> nodes.id`
- path queries: `fsNodeByPath`, `fsChildrenOfPath`
- ingestion: `fsRowsFromTree`
- fields: `id`, `parentId`, `position`, `name`, `kind`, `src`

`FsRow` is inferred from the internal schema relation through Tarstate
`RelationRefRow`. Validation and policy should live outside this package unless
they become part of the schema boundary.

The schema uses Tarstate field builders directly; fs should not carry local
schema or row-type shims.
