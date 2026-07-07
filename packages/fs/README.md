# @patchpit/fs

## API

- `fsSchema`: Tarstate schema manifest for the row contract.
- `FsRow`: row type inferred from the Tarstate relation.
- `fsNodes`: query alias for the `nodes` relation.
- `fsNodeByPath`: query for one row by namespace path.
- `fsChildrenOfPath`: query for direct children of a namespace path.
- `fsRowsFromTree`: parse a filesystem tree into rows.
- `FsTree`: filesystem tree input type.

## Filesystem Shape

We use the filesystem shape from [pushwork](https://github.com/inkandswitch/pushwork/).

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

The root has no name until mounted. `src` is inert; resolution belongs to the
consumer.

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

- `id`: namespace path.
- `parentId`: parent namespace path, or `null` for root.
- `position`: child order from the keyed tree.
- `name`: entry key/name.
- `kind`: `dir` or `file`.
- `src`: inert file reference string.

## Boundaries

This package turns tree metadata into Tarstate rows. It does not fetch, decode,
or resolve `src`. Behavior examples live in `src/fs.test.ts`.
