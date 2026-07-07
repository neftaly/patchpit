# @patchpit/fs

## API

- `fsSchemaManifest`: Tarstate schema manifest for the row contract.
- `FsRow`: row type inferred from the Tarstate relation.
- `fsNodes`: query alias for the `nodes` relation.
- `fsNodeByKey`: query for one row by relation key.
- `fsChildrenOfKey`: query for direct children of a relation key.
- `fsRowsFromTree`: parse a filesystem tree into rows.
- `FsTree`: filesystem tree input type.

## Filesystem Shape

The input tree follows the current [pushwork](https://github.com/inkandswitch/pushwork/)
folder shape closely.

```ts
type FsTree =
  | {
      kind: 'dir';
      entries: readonly (readonly [name: string, tree: FsTree])[];
    }
  | {
      kind: 'file';
      src: string;
    };
```

The root has no name until mounted. Duplicate, empty, and slash-containing names
are preserved as data.

Example:

```json
{
  "kind": "dir",
  "entries": [
    ["README.md", { "kind": "file", "src": "automerge:readme" }],
    ["ghostscript-tiger.svg", {
      "kind": "file",
      "src": "https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg"
    }],
    ["src", {
      "kind": "dir",
      "entries": [
        ["main.ts", { "kind": "file", "src": "automerge:main#head1|head2" }]
      ]
    }]
  ]
}
```

## Rows

`@patchpit/fs` turns the tree into Tarstate `nodes` rows:

- `key`: structural address as ordered child indexes.
- `parentKey`: parent structural key, or `null` for root.
- `path`: unencoded path segments.
- `position`: child order from the keyed tree.
- `name`: entry key/name.
- `kind`: `dir` or `file`.
- `src`: file source string.

## Boundaries

This package turns tree metadata into Tarstate rows. Behavior examples live in
`src/fs.test.ts`.
