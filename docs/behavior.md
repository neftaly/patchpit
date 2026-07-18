# Patchpit behavior

This is the current product behavior. Identifiers are stable references for
discussion; they are not release numbers.

## B1. Root invocation

The JSON URL hash selects the root Automerge filesystem document with `src` and
accepts inert `sync` and opaque `delegation` values for document-host adapters.
Missing `src` creates a root and canonicalizes the hash. Changing the
recognized hash replaces the active root lifecycle and closes resources owned
by the previous root.
Sandbox application hashes are app-owned and do not inherit root invocation
values.

## B2. Filesystem identity and resources

Folders are document-centric Automerge documents. Links have stable logical
IDs; names, order, paths, and parent folders are mutable facts. Duplicate names
remain distinct links. Direct `https:` leaves are external resources rather
than Automerge documents, apps, or implicit fetch requests. Unavailable,
incomplete, invalid, stale, and closed source state never appears as an empty
filesystem. Claimed Patchwork folder compatibility is two-way: supported
Patchpit edits reopen in pinned Patchwork, and Patchwork edits to compatible
Patchpit folders reopen without losing Patchpit or unknown metadata. Foreign
file profiles remain read-only.

## B3. Application launch

A folder is launchable when its direct links contain `index.html`. Launch
materializes an immutable, exact, authority-scoped snapshot with every
contributing source basis. Relative HTML, CSS, modules, and assets resolve from
the mounted snapshot. Missing content, unresolved sources, an inexact graph,
or a missing direct entry prevents launch. The same-origin runner accepts
trusted applications only.

## B4. Durable workspace and per-client presence

The Automerge workspace stores split topology, split ratios, stable context
IDs, pinned context URLs, pane placement, and tab order. Per-client presence
stores the selected context in each pane, one replaceable preview per pane, and
an ordered history of recently interacted context IDs. Presence is neither
written into the durable workspace nor shared as application data.

## B5. Selection and active editor

Each pane has one selected context or is empty. Interaction with a selected tab
panel, its ordinary content, or any reachable same-origin sandbox frame moves
that stable context ID to the front of recent history. The active editor is a
projection: it is the first mounted, editor-compatible context in that history.
If history contains no eligible editor, selected contexts and then layout order
provide a deterministic mounted fallback. Resources can therefore be the most
recent context without becoming the editor that receives the next preview.
Moving a context preserves this identity; closing one removes it during
reconciliation and naturally exposes the next eligible editor. The active
editor tab has a one-pixel top indicator.

## B6. Opening and pinning resources

A single pointer click opens an eligible resource as a replaceable preview in
the active editor pane. A double click or native keyboard button activation
pins it durably. Opening an already-mounted URL selects its existing context;
a pin request promotes an existing preview in its current pane.
If no editor pane exists, opening creates one beside the first pane. Replacing
a preview does not create durable workspace state; moving or pinning it does.

## B7. Closing panes and contexts

Closing a context removes that stable context ID, not a selected, active, or
path-derived substitute. Every tab has a labeled close control. Auxiliary mouse
button 1 over a tab issues the same close intent without first selecting the
tab; it suppresses the browser's auxiliary default. Other mouse buttons, touch,
and pen input do not gain close behavior. Closing the final context in a
non-root pane collapses that pane and its parent split. The root pane may remain
empty. Splitting a pane by moving its own final context to the new child may
leave the original child pane empty.

## B8. Drag and drop

Dragging a tab can reorder it, move it to another pane, or split a pane at an
edge. Dragging a resource creates a pinned placement only after a valid drop.
A resource drag that starts in a file pane and ends in that same pane is a
no-op; Patchpit does not currently interpret it as filesystem move or rename. A
drag session owns its current validated visual target, and ending or cancelling
the session removes that target.

## B9. Pane resizing

Each split has one visible three-pixel resize element, which is also the exact
pointer hit area. Resizing starts only for a primary touch pointer or the
primary left mouse button. Pointer movement changes an ephemeral draft; pointer
up commits one durable ratio, while cancellation discards the draft. Keyboard
arrow keys adjust the focused separator in five-percent steps. Ratios remain
within ten to ninety percent.

## B10. Keyboard and accessibility

Tabs use the tablist, tab, and tabpanel pattern. Left and right arrow keys move
selection within a tablist. Every close action remains available through a
labeled button. Activating that button moves focus to the surviving selected
tab in the same pane; if the pane collapses, focus moves to the surviving active
editor when it is not being closed, then the first selected tab in layout
order, or the empty workspace.
Middle-click is only a pointer convenience and does not transfer focus. Split
handles are focusable separators with orientation, value, and controlled-pane
relationships. Native button activation supplies resource keyboard behavior;
Patchpit defines no independent shortcut system.

## B11. Readiness and failure

Parsing and data-dependent failures produce explicit issues or unavailable
states. Programmer mistakes and violated lifecycle invariants may throw.
Incomplete sources do not masquerade as empty relations. Sandbox launch
requires ready, current, exact input; source changes during materialization are
retried within a fixed bound or fail explicitly.

## B12. Replication and atomicity

Automerge documents are canonical CRDT storage and merge ordinary concurrent
changes. Live browser clients in the same origin and Patchpit deployment
exchange document changes through a deployment-scoped BroadcastChannel. This is
ephemeral replication, not persistence: a document becomes unavailable once no
live or otherwise attached replica can supply it. A single attached source is
the atomic write boundary. Work spanning multiple sources is non-atomic and
must expose partial completion when such operations are implemented. Per-client
presence remains separate and does not derive from Automerge change history
because clicks and focus can change interaction intent without changing a
durable document.

## B13. Demo Markdown editor

A freshly bootstrapped demo root contains one launchable Markdown editor folder
with an ordinary visible Automerge text document named `demo.md`. The launched
app reads that file from its immutable sandbox snapshot and supports text input,
selection, composition, and semantic UTF-16 splice reporting through native
EditContext or the pinned polyfill. The two input paths have the same observable
editing behavior.

This is an input experiment, not yet a document editor: edits are session-local,
remounting reloads `demo.md`, and no persistence, replication, presence, undo,
or save claim is shown. The demo artifact is imported only when creating a fresh
root. Changing a built-in demo never mutates or reseeds an existing root
identity.
