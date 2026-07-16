# Patchpit direction

Patchpit targets a lightweight, document-centric local-first environment with
substantial behavioral and file-primitive overlap with Patchwork. Patchwork is
the reference for mature document and filesystem semantics. Patchpit diverges
only for an explicit product behavior, security boundary, or stronger
consistency guarantee; Tarstate/FRelP replaces bespoke projection, authority,
readiness, and write plumbing. Patchwork-compatible Automerge documents are a
target; Patchwork's tool runtime and host APIs are not.

## Decided model

### C1. Document identity

An Automerge document URL is durable resource identity. Files, folders,
workspaces, and future application data are documents. In the canonical model,
tabs and views target documents rather than filesystem projection rows.

### C2. Folder placement

A folder document uses the Patchwork-compatible physical shape `title` plus an
ordered `docs` collection. Each link contains `name`, `type`, and an Automerge
`url`, with optional interoperable hints such as `icon` and `copyOf`. Link name,
order, and derived path are placement facts. Link type and presentation hints
are not authoritative for the target document. A link occurrence has stable
source-local identity but is not global resource identity or an app-facing
primitive. Patchpit-owned links store an explicit occurrence ID; foreign
Patchwork links derive it from source-native Automerge object identity when
available. Writers store the best known Patchwork type hint, but retyping a
linked document cannot atomically update every inbound link; stale hints remain
diagnosable hints rather than changing the target's logical type.

One name and one occurrence of a document URL per folder is the desired
resolved state, matching Patchwork's normal folder behavior. It is not a
coordination-free invariant: concurrent replicas may create duplicates. Those
links remain representable and queryable while path resolution reports
ambiguity instead of silently selecting a winner.

### C3. File content

A file uses the Patchwork-compatible physical fields `name`, `extension`,
`mimeType`, and `content`. Writable collaborative text is stored as Automerge
text; binary content is stored as bytes. Patchpit uses one exact logical file
relation with a discriminated text or binary content branch. Separate storage
mappings preserve each physical representation, and changing representation is
an explicit document retype. Sandbox launch materializes either branch as
immutable bytes.

The document name is its default title while each folder link owns its
placement name, so aliases may deliberately differ. Foreign compatible files
may also contain an Automerge immutable string, which is readable text without
implying write capability. Reading a foreign file does not claim ownership or
mutate it. Concurrent binary replacements or representation changes may
produce conflict evidence; no adapter selects a winning value implicitly.
Inline bytes are the Patchwork-compatible binary profile, not a claim that
arbitrarily large blobs belong in Automerge history. Explicit attached content
stores may advertise different identity, offline, and write capabilities; they
do not masquerade as fully round-trip-compatible Patchwork file documents.

### C4. Metadata ownership

`@patchpit` declares that the document uses a Patchpit-owned format and names
its exact primary Tarstate schema. It is a semantic declaration, not proof of
provenance, trust, or write authority. Self-contained documents inline exact
sealed artifacts.

Patchpit-owned interoperable documents also store a minimal physical
`@patchwork.type` discriminator so Patchwork can recognize them. A Tarstate
storage mapping or attachment adapter interprets that physical convention; it
is not a logical relation field. Foreign namespaced metadata is preserved and
ignored unless an explicit adapter supports it. Normal content writes do not
rewrite metadata. Missing, conflicted, or inconsistent `@patchwork` metadata
impairs interoperability and produces an issue, but cannot override an exact
valid `@patchpit` declaration.

Only Patchpit-owned durable documents require this envelope. Attachment uses
the following precedence:

1. Any present `@patchpit` envelope must be conflict-free and parse exactly or
   the document is invalid; typed attachment never falls through to foreign
   metadata or shape inference, but raw inspection remains available.
2. A conflict-free recognized `@patchwork.type` may nominate a foreign
   compatibility adapter, which must still parse the physical shape.
3. An exact, versioned, unambiguous physical-shape predicate may nominate a
   conservative foreign adapter, normally read-only. Adapter selection never
   uses heuristic scoring.
4. Everything else remains raw or unknown.

Inference never grants authority, claims ownership, or mutates the document.
It considers only the host's explicitly installed compatibility adapters. An
inferred adapter is evidence for the current source snapshot and may be
replaced when the foreign representation changes. It exposes writes only when
its current attachment explicitly preserves them and the caller separately has
write authority. Reading or writing through a foreign adapter is not adoption.
Multiple matching adapters produce ambiguity evidence and fall back to raw
inspection.

Adding or changing `@patchpit` is an explicit adoption or migration operation
with a source basis and receipt, not a side effect of reading. In-place adoption
requires write authority and a representation-preserving mapping, and is
re-projected and validated after concurrent changes merge. Transformation
defaults to copy/import with new document identity. Concurrent incompatible
adoptions may produce metadata conflicts, which remain inspectable and require
explicit repair rather than winner selection.

### C5. App launch

A folder whose direct link name is `index.html` is an app. This is an explicit
web-application convention, distinct from Patchwork's host-loaded
`package.json` tool modules. Launch captures an immutable, authority-scoped set
of files and records every contributing source basis. Exactness is relative to
that settled membership and those per-source bases; it does not imply a global
cross-document transaction. Missing sources remain incomplete rather than
becoming empty folders.

### C6. Interoperability boundary

Patchpit and Patchwork should share file, folder, directory, Markdown, and
selected application documents. Compatibility is capability-specific:
identify, read, preserve, write without representation loss, and create are
separate levels. An adapter advertises only the levels it actually supplies;
read-only compatibility is not described as round-trip support.

Patchpit-owned documents carry both authoritative `@patchpit` declarations and
minimal `@patchwork` dispatch metadata. Foreign Patchwork documents use
host-supplied adapters selected from their observed physical shape, preserve
unknown fields, and remain foreign. Patchwork plugin execution, raw handles,
and host protocol compatibility are outside this boundary.

### C7. External resources

Direct `https:` leaves are external resources, not Automerge documents or
implicitly executable applications. Folder metadata, resolution state, and
fetched bytes remain separate. Discovery applies authority before any resolver
may cause network access, and absent explicit resource authority an app
snapshot remains incomplete rather than fetching a URL.

## Distributed semantics

### S1. Available convergence

Automerge permits local work during partitions and converges replicas later.
Patchpit may gate a particular action on readiness or authority, but does not
claim global linearizability or prevent remote changes from existing.

### S2. Atomic boundary

One Automerge document is one atomic write boundary. Multi-document move, copy,
lineage, and lifecycle operations are explicit sequences with partial outcomes,
not transactions disguised by the UI.

### S3. Merge-aware constraints

Simulation can reject a locally invalid intent, but a concurrent merge may
still violate uniqueness, reachability, or application constraints. Tarstate
projects the merged state, reports issues, and keeps repairable facts visible.
Constraints never turn an invalid remote state into an empty relation or a
silently chosen winner.

### S4. Basis-relative snapshots

Every multi-source result identifies settled membership and each contributing
source basis. Readiness and exactness apply to that captured set. A later
network discovery or remote change produces a replacement projection rather
than retroactively changing an issued snapshot.

### S5. Eventually available references

A valid link may target a source that is unauthorized, offline, not yet
replicated, or permanently unavailable. Referential integrity is represented
as readiness and issue evidence rather than a synchronous foreign-key promise.

### S6. Authority outside replicated claims

CRDT convergence does not authenticate document metadata. Artifact hashes name
exact content but do not grant authority. Hosts apply trust and capability
policy before attachment, discovery, reading, writing, or launch.

### S7. Relative synchronization

Offline, syncing, and synchronized states are relative to named adapters,
peers, and known heads. Patchpit never presents synchronization with one server
as proof that every replica has received the document.

### S8. Causal history

Automerge history is a causal graph. Preview pins explicit heads; restore
creates a new change expressing selected historical state; copy creates new
document identity. Neither operation rewinds shared history.

### S9. Causal ordering

Heads and change dependencies establish causal order. Wall-clock timestamps are
presentation metadata and may be skewed, absent, or equal; they never choose a
conflict winner, establish authority, or define a total history.

### S10. Replication privacy

An Automerge URL is identity, not a secret or authorization token. Network
adapters define share policy, peer authentication, transport protection, and
at-rest guarantees. Patchpit does not describe a document as private or
encrypted merely because it is local-first or currently unavailable.

## Foundation constraints

### F1. Canonical folder documents

Canonical filesystem storage is an ordered Patchwork-compatible folder graph:
folder documents contain `title` and `docs`, while links contain document URLs
and placement facts. Patchpit-owned folders additionally carry exact
`@patchpit` declarations and minimal `@patchwork.type: folder` metadata. The
browser host's flat root adapter is temporary; Tarstate's live source-link
queries provide the recursive membership lifecycle needed to replace it. The
durable flat entry table is not an application primitive and must not become a
second filesystem ontology.

### F2. Untrusted application isolation

The same-origin sandbox profile remains restricted to explicitly trusted
applications. Before untrusted applications are accepted, mounts move to an
authority-free runner origin and no Repo, source handle, credential, or host
capability crosses that boundary. App discovery or document compatibility does
not confer trust.

## Next behaviors

### N1. Durable reopening

Use the injectable Repo boundary to persist and reopen the root folder document
across browser lifetimes. Root `src` continues to identify that document.
Concurrent browser tabs either share a storage/network protocol that converges
normally or report an unsupported ownership conflict; they never assume a hash
alone proves that document bytes remain locally available.

### N2. Semantic link operations

Keep these behaviors distinct:

1. Rename or reorder a link within one folder document.
2. Unlink a document without deleting it.
3. Add an alias link to an existing document in another folder.
4. Detect and expose concurrently created duplicate names or targets without
   dropping either fact.

Identity-preserving link movement is a separate capability from preserving the
linked document's identity.

### N3. Scoped application data

The first real editing application is a Patchwork-compatible Markdown editor.
It should drive a minimal host protocol for:

1. Receiving an authority-scoped Tarstate projection.
2. Observing replacement projections and their readiness.
3. Simulating and submitting semantic operations.
4. Asking the host to open or create a document.

Applications do not receive a Repo, raw `DocHandle`, foreign source handles, or
a generic provider registry.

### N4. Cross-source move and copy

Moving a link between folders removes and adds occurrences across two atomic
sources, so its receipt exposes partial completion and retry/repair state. A
copy creates a new document identity, writes `@patchwork.copyOf` on the copy,
and may add a best-effort `@patchwork.copies` backlink to the source. One-sided
lineage is valid evidence rather than corruption.

## Later behaviors

### L1. Alternate directory sources

Mount Patchwork `@patchwork.type: directory` documents, including flat, nested,
and mixed longest-prefix path forms, or other filesystem stores through source
adapters. A source advertises only the identity and write capabilities it can
actually preserve. Compatible path materialization handles conflict-free file
shapes, strings, bytes, immutable strings, and logical JSON; conflicts,
unavailable references, or unsupported values produce evidence instead of a
silently selected representation.

### L2. Open With

Offer compatible views based on the target document's exact logical schema and
media type. The raw viewer remains a fallback. Editable Markdown and rendered
Markdown preview supply the first real alternative views. Word and character
count is an auxiliary view feature, not a reason to introduce host registry
machinery.

### L3. Typed creation

Create a canonical, Patchwork-compatible document of a selected logical type,
place a link to it in a folder, and open it with a compatible application.

### L4. Sync status

Expose ready, incomplete, invalid, offline, synchronizing, and synchronized
state once persistent/network adapters make those distinctions real. Always
name or make inspectable the adapter, peer set, and heads to which sync status
is relative.

### L5. Presence

Attach ephemeral per-client viewing and editing state to documents. Presence is
not durable workspace state.

### L6. History

Provide generic Automerge history inspection, heads-pinned preview, and
explicit restore or copy operations without presenting a concurrent history as
falsely linear. Restore records a new change; copy lineage metadata is advisory
and may be one-sided. History and lineage traversal remain authority-scoped and
bounded before following additional document references.

### L7. App discovery and import

A static catalogue may locate independently hosted app packages. Importing an
app creates an ordinary linked document graph rooted at a folder; running the
app does not depend on the catalogue afterward. Catalogue presence grants no
execution authority, and only trusted applications use the temporary
same-origin runner.

### L8. Document lifecycle and retention

Keep unlinking, semantic tombstoning, stopping advertisement/sync, local
eviction, and host garbage collection distinct. Replication means Patchpit
cannot promise global erasure of a document already received by another peer.
Lifecycle receipts state which host-local action actually occurred.

### L9. Portable import and export

Import native directories and supported directory-map documents as linked
document graphs without confusing host paths with document identity. Export a
captured folder graph to ordinary files with explicit conflict, ambiguity,
encoding, and identity-loss reports. Import/export is a boundary conversion,
not the canonical storage model.

### L10. Large content stores

Support explicitly attached blob or filesystem content stores when inline
Automerge bytes would make replication or history unreasonable. File metadata
and content readiness remain relationally visible, while the adapter reports
whether it preserves offline availability, content identity, replacement, and
export. No transparent threshold silently changes a document's storage model.

## Operational constraints

### O1. Schema evolution

Exact artifact identities make schema and mapping versions explicit. New
readers retain old adapters while supported documents exist; migrations are
semantic operations with receipts, never incidental reads. Unknown foreign
fields and metadata survive compatible writes.

### O2. Bounded work

Recursive discovery, artifact parsing, relation projection, snapshot byte
materialization, history inspection, and sandbox installation have explicit
budgets and cancellation. Exceeding a bound produces incomplete or invalid
evidence rather than blocking the browser or truncating silently. Metadata and
link queries do not materialize file bodies until a content view, export, or
authorized app snapshot requires them.

### O3. Name semantics

Canonical link names are non-empty case-sensitive Unicode path segments; exact
string equality applies, `/`, `.`, and `..` are not canonical link names, and
Patchpit performs no implicit case folding or Unicode normalization. Foreign
unaddressable names remain inspectable with issues. Adapters own case folding,
normalization, reserved names, separators, and identity loss for their external
store. A source never advertises stronger rename or move preservation than it
supplies.

### O4. Persistence and recovery

An Automerge URL identifies a document but does not guarantee that a browser
still stores or can retrieve it. Durable reopening reports local eviction,
adapter failure, and network unavailability distinctly. Export and later sync
provide recovery paths without changing document identity.

### O5. Interoperability evidence

Compatibility is tested with golden Automerge documents created and edited by
both Patchwork and Patchpit. Acceptance covers unknown-field preservation,
text and binary files, immutable strings, folder ambiguity, directory maps,
copy lineage, unavailable links, and edits returning to the originating
system. Attachment cases include malformed and conflicted owned envelopes,
untrusted but structurally valid declarations, foreign metadata/shape
disagreement, multiple matching adapters, representation changes after
inference, and compatible and incompatible concurrent adoption.

### O6. Visible repair state

Incomplete, conflicted, ambiguous, read-only, and partially completed states
remain inspectable and actionable. Their controls work by keyboard and assistive
technology and do not rely on color alone. Product UI summarizes Tarstate
evidence without hiding its source or inventing a resolved value.

### O7. Content interpretation

Names, extensions, media types, and document type hints are untrusted metadata.
Viewers use bounded parsing, executable HTML runs only through the authorized
sandbox path, and media fallback never turns an unknown document or direct URL
into executable host content.

### O8. Convergence evidence

Behavior fuzzing exercises concurrent edits, reorder/move fallbacks, duplicate
links, metadata conflicts, partial cross-source operations, delayed discovery,
and replica merge order. Replicas that receive the same changes must converge
to equivalent source state, Tarstate issues, and authority-scoped projections;
tests do not assert one privileged delivery order.

## Candidate applications

### A1. Markdown

A collaborative Markdown document and editor is the acceptance case for scoped
application reads and semantic writes. It uses `@patchwork.type: markdown` and
an Automerge text `content` field. This document type remains distinct from a
generic Patchwork file whose media type is Markdown; views may support both
through their respective adapters without relabelling either document on read.

### A2. Relational tools

Todo, table, spreadsheet, Kanban, contact, and collection applications are
good Tarstate/FRelP demonstrations. Preserve compatible logical document types
where useful, but use keyed relational structures rather than storage layouts
with poor concurrent merge behavior.

### A3. Document canvas

A canvas may embed live links to ordinary documents and offer alternate views
over them. It remains an application rather than becoming workspace or host
machinery.

### A4. Rich applications

Chat, calls, maps, media sequencing, games, conversion tools, and AI-assisted
tools are possible applications. None defines a generic host capability until
an implemented application demonstrates that requirement.

## Explicitly deferred

### D1. Patchwork tool compatibility

Patchwork plugin, provider, command, package, frame, and raw-handle runtime
compatibility is not a Patchpit goal. This does not defer the compatible
document formats in C6.

### D2. Framework machinery

Do not add account systems, configurable frames, provider registries, command
registries, or separate base/experiments distributions without concrete
product requirements.

### D3. Premature app contracts

Do not add a general capability manifest, renderer registry, or app-data
protocol before a real application supplies its acceptance case.
