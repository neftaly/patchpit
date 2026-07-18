# Patchwork fixtures

These are Automerge histories created by Patchwork's own datatype initializer
and document-creation code at the exact commits recorded in `manifest.json`.
The manifest also records the Automerge runtime versions used to execute that
code. They are compatibility evidence, not canonical Patchpit test data.
`compatibility.json` is the executable claim matrix: identify, read, preserve,
write, and create remain separate capability levels.

Regenerate them from clean upstream checkouts with:

```sh
pnpm fixtures:patchwork \
  --patchwork /path/to/patchwork \
  --patchwork-base /path/to/patchwork-base
```

The generator deliberately records several independent concerns in one folder:
an alias, duplicate placement names, an unavailable Automerge link, valid
Patchwork optional fields, and fields unknown to Patchpit. File fixtures cover
plain text, bytes, and Automerge immutable text. The fixture-only
`suggestedImportUrl` values use IANA's reserved `example.com` domain.

The generator also executes both directions of claimed folder compatibility:
Patchpit unlinks an occurrence from an upstream folder before pinned Patchwork
reopens it; pinned Patchwork then identifies, reads, and renames a folder
created by Patchpit before Patchpit reopens it. The resulting histories are
pinned beside their source fixtures.
