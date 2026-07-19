# Patchpit roadmap

This document contains future work only. Goal identifiers are stable references,
not release numbers. Each goal is complete only when its acceptance evidence is
executable; implementation details and already-delivered behavior do not belong
here.

## Near-term work goals

### W2. Durable reopening

Persist and reopen the root Automerge document through the injectable Repo
boundary. The root invocation's `src` remains document identity; missing `src`
creates a root and canonicalizes the hash, while replacing `src` replaces the
active root lifecycle.

Persistence must distinguish a document that is unavailable, evicted, invalid,
or unsupported from a newly created document. Before the implicit demo root is
persisted, its root declaration must distinguish bootstrap generation from user
document identity. Opening never silently reseeds, migrates, or replaces an old
root; requesting a fresh demo creates new identity. Durable reopening must not
persist per-client presence state or pass root `sync` and `delegation` values
into sandbox application hashes.

Acceptance evidence:

1. A browser behavior case creates, closes, and reopens the same root identity
   with its durable workspace and folder graph intact.
2. Missing storage, local eviction, adapter failure, and invalid bytes produce
   distinct evidence.
3. Root replacement closes subscriptions, attachments, presence, and sandbox
   mounts belonging to the previous lifecycle.
4. A bootstrap version change reopens the old root unchanged with explicit
   supported or unsupported evidence, while an explicit fresh bootstrap gets a
   new root identity.
5. Abrupt peer loss cannot indefinitely block readiness for documents already
   held by a surviving replica; adapter liveness failure produces bounded,
   explicit evidence.

### W5. Cross-source copy and move

Implement cross-folder operations as explicit sequences over independent atomic
sources. Moving a link removes and adds occurrences across two folder documents;
copying creates new document identity and records compatible lineage metadata.
This is copy/relocate across source boundaries, not W6 identity-preserving
reorder within one source: a destination occurrence has its own source-local
identity.

Receipts must expose partial completion, retry, repair, and idempotency evidence.
One-sided `copyOf` lineage is valid: the original does not acquire a reverse
list of copies. The UI must not describe these operations as atomic transactions.

Relocation adds the destination occurrence before unlinking the source. It keeps
the referenced document identity and known placement metadata, but allocates a
stable destination-local link ID and appends at the destination's source-native
position. The source occurrence is unlinked only if its complete transferable
facts still match the observed intent. A concurrent rename, retarget, or metadata
change stops the sequence with both occurrences visible rather than discarding
the concurrent fact. Repeating a known step accepts an exact existing result and
rejects the same stable key with different data. Duplicate names remain valid.

Copy first creates a new Automerge document identity from the supported source
history, then adds a destination occurrence whose `copyOf` names the immediate
source document. Copying a copy therefore records its immediate parent rather
than rewriting lineage into a guessed total ancestry. Unsupported external
resources and document types reject explicitly. Moving into the same folder is
a no-op, not reorder. Folder copy or relocation that would introduce a reachable
cycle rejects before its first mutation.

Normal progress requires ready, current, exact source and destination evidence.
Every retry re-projects both folders and classifies the observable postcondition
before choosing the next step. No timeout, thrown exception, or lost connection
is reported as rollback.

Acceptance evidence:

1. Every interruption point—including after document creation and after
   destination insertion—has a behavior case with an actionable receipt and
   observable repair choice.
2. Retrying an already-applied step does not duplicate an occurrence or document;
   a stable-key collision with different data rejects.
3. Concurrent rename, retarget, unlink, destination collision, readiness loss,
   and folder-graph changes are re-projected before the next step and never
   silently lose source facts.
4. Delivery-order fuzzing reaches the same classified complete, partial, failed,
   or unknown evidence for equivalent converged source states.
5. Copy and relocation preserve the compatibility level advertised for each
   source and retain unknown Automerge/Patchwork document data.
6. Same-source drops, unsupported copies, self/descendant folder targets, and
   duplicate names have explicit distinct behavior.

### W6. Identity-preserving reorder

Add semantic link reorder after the generic source capability exists in
Tarstate. Do not build a Patchpit-local transaction or identity workaround.

Until Automerge exposes native object moves, the Automerge adapter records move
lineage on the document root in `__automergeMoves`, keyed by source object
identity. The physical list order remains readable by ordinary Patchwork
clients, while Patchpit and Tarstate depend on the semantic move guarantee
rather than the journal representation. Native identity-preserving moves,
fallback semantic moves, and copy/relocate remain distinct capabilities.

Acceptance evidence:

1. Reorder preserves logical occurrence identity through local and merged edits.
2. Ordinary Patchwork readers observe the resulting physical order while safely
   ignoring private bookkeeping.
3. Concurrent reorder, rename, insert, unlink, and duplicate-name cases converge
   to equivalent source state and Tarstate evidence in every delivery order.
4. A later native Automerge move can replace the fallback without changing the
   Patchpit schema or semantic operation.

### W7. Authority-free runner origin

Before accepting untrusted applications, move sandbox execution and mounts to a
separate authority-free origin. Define only the transfer protocol required by a
real untrusted application acceptance case.

No Repo, source handle, host credential, ambient same-origin storage, or host
capability may cross the boundary. Content Security Policy, service-worker scope,
mount cleanup, navigation, and failure behavior must be exercised in a real
browser.

## Later work goals

### W8. Alternate directory sources

Mount Patchwork directory documents and other filesystem stores through source
adapters. Support flat, nested, mixed longest-prefix, string, byte, immutable
string, and logical JSON representations only to the capability level each
adapter actually preserves. Conflicts and unsupported values remain evidence.

### W9. Generalized views and typed creation

Generalize only the view-selection and creation behavior demonstrated by the
multiplayer Markdown editor.
Offer compatible views using exact logical schema and media type, offer raw
inspection as fallback, and create canonical documents of selected logical
types without introducing a generic renderer or provider registry.

### W10. Relative sync status

Expose offline, ready, incomplete, invalid, synchronizing, and synchronized
states only after persistent or network adapters make them observable. Every
sync claim must name or expose the adapter, peer set, and known heads to which it
is relative.

### W11. History, preview, and restore

Provide bounded, authority-scoped Automerge history inspection. Preview pins
explicit heads; restore creates a new change expressing selected historical
state; copy creates new document identity. Wall-clock timestamps remain
presentation metadata rather than conflict resolution or total ordering.

### W12. Application discovery and import

Allow a static catalogue to locate independently hosted application packages.
Import creates an ordinary linked document graph and running the imported app no
longer depends on the catalogue. Catalogue presence grants no execution
authority; untrusted catalogue applications depend on W7.

### W13. Document lifecycle and retention

Keep unlinking, semantic tombstoning, stopping advertisement or sync, local
eviction, and host garbage collection distinct. Receipts state the host-local
action performed and never promise global erasure of replicated data.

### W14. Portable import and export

Convert native directories and supported directory-map documents to and from
linked document graphs. Reports must preserve conflict, ambiguity, encoding,
readiness, and identity-loss evidence instead of presenting conversion as the
canonical storage model.

### W15. Large content stores

Support explicit attached blob or filesystem content stores when inline
Automerge bytes would make history or replication unreasonable. Adapters expose
offline availability, content identity, replacement, export, and readiness
capabilities. No implicit size threshold may silently change a document's
storage model.

## Requirements for every goal

### R1. State ownership

Choose canonical storage, Tarstate relational machinery, or Patchpit
product/runtime semantics before adding state. Cross-layer projections and
writers must not create a second source of truth.

### R2. Distributed semantics

One source is one atomic write boundary. Incomplete sources are not empty
relations. Multi-source results identify exact membership and every contributing
source basis. Metadata and document URLs do not grant authority, availability,
privacy, or global synchronization.

### R3. Exact evolution

Schema, mapping, constraint, and capability identities are exact. Readers retain
supported old adapters; migrations are explicit semantic operations with
receipts, never incidental reads. Generated artifacts come only from canonical
sources.

### R4. Bounded work

Discovery, parsing, projection, history, materialization, import, export, and
installation have explicit budgets and cancellation. Exhaustion produces
incomplete or invalid evidence rather than silent truncation or an unresponsive
browser.

### R5. Interoperability evidence

Compatibility claims require pinned upstream fixtures and behavior evidence.
Unknown fields survive compatible writes. Metadata/shape disagreement,
multiple adapters, representation changes, and incompatible concurrent
adoption remain explicit.

### R6. Visible and accessible repair

Incomplete, conflicted, ambiguous, read-only, and partially completed states
remain inspectable and actionable. Controls work by keyboard and assistive
technology and never rely on color alone.

### R7. Convergence testing

New correctness coverage favors behavior fuzzing, browser behavior cases, and
small benchmarks. Replica tests vary concurrent edits, merge order, delayed
discovery, metadata conflicts, and partial multi-source operations; they assert
equivalent converged state and evidence rather than one privileged delivery
order.

### R8. Content security

Names, extensions, media types, document hints, catalogue entries, and external
URLs are untrusted metadata. Executable content runs only through its authorized
sandbox path, and discovery applies authority before any resolver may cause
network access.

## Explicitly deferred

### D1. Patchwork tool runtime compatibility

Do not implement Patchwork plugin, provider, command, package, frame, or raw
handle runtime compatibility. Compatible document formats and file primitives
remain in scope through pinned interoperability fixtures and concrete apps.

### D2. Framework machinery

Do not add accounts, configurable frames, provider registries, command
registries, or separate base/experiments distributions without a demonstrated
product requirement.

### D3. Premature application contracts

Do not add a general capability manifest, renderer registry, or app-data
protocol before a concrete application supplies its acceptance case.
