# @patchpit/fs draft

Owns filesystem namespace shape only.

## Owns

- `name`
- `kind: 'dir' | 'file'`
- file `src` reference string
- ordered folder entries
- Pushwork-compatible namespace path identity
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

`id` is the Pushwork namespace path. This mirrors `Tree.dir.entries:
Map<string, Tree>`: sibling names are keys in the parsed input shape, not fields
to validate after parsing.

Tree ingestion follows the Pushwork model: dirs own keyed entries, files own a
`src` string. It parses structure into rows; it does not validate URL syntax,
existence, MIME, or resolver support. Source-specific path/key policy belongs in
the source parser or resolver, not in this namespace row package.

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
- queries: `fsNodeByPath`, `fsChildrenOfPath`
- ingestion: `fsRowsFromTree`
- fields: `id`, `parentId`, `position`, `name`, `kind`, `src`

`FsRow` is inferred from the internal schema relation through Tarstate
`RelationRefRow`. Validation and policy should live outside this package unless
they become part of the schema boundary.

The schema uses Tarstate field builders directly; fs should not carry local
schema or row-type shims.
