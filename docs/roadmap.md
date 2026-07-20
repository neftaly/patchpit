# Patchpit roadmap

This document contains future work only. Goal identifiers are stable references,
not release numbers. Each goal is complete only when its acceptance evidence is
executable; implementation details and already-delivered behavior do not belong
here.

## Near-term work goals

### W6. Native identity-preserving reorder

Add generic filesystem link reorder only after Automerge supplies a native
identity-preserving object move and Tarstate exposes it as a source capability.
Do not emulate it with delete/reinsert, private ordering metadata, or a
Patchpit-local transaction. Application-specific rank or predecessor fields are
ordinary schema data, not filesystem move compatibility. Copy/relocate and
native physical move remain distinct capabilities.

Acceptance evidence:

1. Reorder preserves logical occurrence identity through local and merged edits.
2. Concurrent field edits retain the original Automerge object and its merge
   behavior.
3. Patchpit, Patchwork, and ordinary Automerge readers observe the same physical
   order without a private interpretation protocol.
4. Repeated and concurrent reorder, rename, insert, unlink, and duplicate-name
   cases converge to equivalent source state and evidence in every delivery
   order.

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
workspace inspector and multiplayer Markdown editor.
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

Add explicit semantic tombstoning, advertisement or sync withdrawal, and host
retention operations without treating unlinking as any of them. Receipts state
the host-local action performed and never promise global erasure of replicated
data.

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
