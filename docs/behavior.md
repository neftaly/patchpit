# Patchpit behavior

This is the current product behavior. Identifiers are stable references for
discussion; they are not release numbers.

## B1. Root invocation

The JSON URL hash selects the root Automerge filesystem document with `src` and
accepts inert `sync` and opaque `delegation` values for document-host adapters.
Missing `src` creates a root and canonicalizes the hash. Changing the
recognized hash replaces the active root lifecycle and closes resources owned
by the previous root.
Entering the browser's back/forward cache releases the active lifecycle;
restoring that page reopens the root selected by the unchanged hash.
Sandbox application hashes are app-owned and do not inherit root invocation
values.

## B2. Filesystem identity and resources

Folders are document-centric Automerge documents. Links have stable logical
IDs; names, order, paths, and parent folders are mutable facts. Duplicate names
remain distinct links. Direct `https:` leaves are external resources rather
than Automerge documents, apps, or implicit fetch requests. Unavailable,
incomplete, invalid, stale, and closed source state never appears as an empty
filesystem. An ordinary file viewer renders only a ready, current, exact logical
file projection and reports other states explicitly; it does not inspect the
physical Automerge document. The owned `workspace.am` occurrence instead opens
a conflict-aware raw JSON inspector that follows Automerge heads without
exposing its handle. Claimed Patchwork folder compatibility is two-way: supported
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
exposes partial completion through nested receipts. Per-client
presence remains separate and does not derive from Automerge change history
because clicks and focus can change interaction intent without changing a
durable document.

## B13. Multiplayer Markdown editor

A freshly bootstrapped demo root contains one launchable Markdown editor folder
with an ordinary visible Automerge text document named `demo.md`. The app asks
the host to open that document relative to its folder over a versioned private
port. The immutable sandbox snapshot supplies application code and assets; it is
not the editable document. The app receives detached projections and opaque
revisions, never a Repo, document handle, Tarstate service, source, credential,
or iframe object.

The editor supports text input, selection, composition, and semantic UTF-16
splices through native EditContext or the pinned polyfill. Each splice is
committed through the Tarstate writer at the exact observed source basis.
Committed edits update the canonical Patchwork-compatible Automerge text,
replicate through the root's live transport, survive app remounting, and merge
ordinary independently based concurrent edits.

The surface follows ordinary multiline plain-text editing behavior. Physical
keyboard input, virtual-keyboard input, clipboard input, and input-method input
reach the same text model. Printable keys and spaces insert text; Enter and
Shift+Enter insert a line feed; Backspace and Delete remove the adjacent
grapheme; and typing, pasting, or pressing Enter over a selection replaces that
selection. Copy is non-mutating, while cut and plain-text paste each produce the
corresponding semantic splice. Rich clipboard formatting is ignored. There is
no submit key, Markdown autoformatting, or Patchpit-specific editing shortcut.

Left and Right move by grapheme, Up and Down retain the closest visual column,
Home and End move to logical line edges, and the platform document-edge and word
navigation modifiers retain their conventional meanings. Shift extends the
selection and Control/Command+A selects all. Tab and Shift+Tab leave the editor;
tab indentation is not yet an editor feature. Navigation preserves selection
direction and never splits a surrogate pair, combining sequence, or joined
emoji.

A primary click or tap places the caret. Primary dragging selects in either
direction, Shift+click extends from the existing anchor, double click selects a
word, and triple click selects a logical line. Non-primary pointer buttons do not
silently reposition the editor selection. Pointer hover is observational: it
does not change text, revision, focus, local selection, participant state, or
local or remote paint. Dropped files, URLs, and rich content neither navigate
the frame nor mutate the document; text drag-and-drop is not promised yet.

Local input paints immediately and each completed semantic splice appends to one
host-owned Tarstate text-intent session. When no publication is active, the
pending prefix publishes immediately. Later locally dependent splices may append
while that prefix is publishing; they retain source-native character identity
and publish as its causal suffix rather than replaying numeric offsets against a
different string. Rejection, an unknown outcome, or a committed result whose
selection cannot be resolved at its exact basis retains the visible local draft
and makes the editor read-only instead of dropping, duplicating, or misplacing
input. Source-level expiry and work-budget failures follow those same observable
rejected or unresolved paths; adapter diagnostics do not become a second
sandbox protocol. A failure in a retained suffix does not falsely describe an
already-publishing prefix as rejected when its outcome is not known.

Each browser profile has one opaque generated display identity. Its label and
color remain stable across Patchpit tabs and reloads on that origin, while every
mounted editor still has a distinct presence session and selection lifecycle.
Clearing site data or using storage that cannot persist may produce a new display
identity; it is not an account, credential, or durable document fact. Color is
not unique identity and is always accompanied by a label in the participant
surface. Automerge Repo Presence shares mounted sessions, their display identity,
and their last selection endpoints as Automerge cursors; it does not write
selection, focus, color, or composition into document history. Normal close
removes presence immediately and abrupt loss expires after a bounded interval.

Local and remote carets and selections are paint-only overlays: they do not
change text wrapping, editor dimensions, scroll dimensions, hit testing, or
assistive-technology text. Remote selections remain listed but are not painted
while the visible local draft differs from the canonical projection, because
their canonical offsets do not identify positions in that temporary string.
When the local text is canonical, remote paint remains stable while the local
user hovers, focuses, moves their own selection, scrolls, or resizes. It is
removed only when the remote session leaves or expires, or the local editor
enters the explicitly non-canonical draft state. Window or element blur retains
the session's last logical selection; switching windows, hovering another
editor, or using surrounding UI must not make collaborator carets blink in and
out. Local and remote carets track scrolling and resizing without moving either
selection; a local navigation or edit scrolls its caret into view without
resetting the horizontal or vertical position unnecessarily.
Intermediate composition remains local and one completed composition produces
one semantic splice against the source basis captured when composition began. A
canonical change received during composition does not disturb the candidate
window. Completion reconciles through the same retained source-native session;
Tarstate resolves the final anchor and focus into detached offsets at the exact
committed basis. Patchpit materializes that immutable historical Automerge view
directly before updating presence or adopting the merged projection, so an
advanced live handle cannot select against the wrong document.
The app fills its viewport and shows only a compact
write/readiness and participant line outside the text. There is no formatting
toolbar, preview, diagnostic counter, save ceremony, or undo behavior.

Native EditContext and the pinned polyfill satisfy the same user-action corpus.
Tests distinguish physical key presses from direct text injection and exercise
actions independently so one passing journey or one early failure cannot hide
unrelated interaction behavior.

The demo artifact is imported only when creating a fresh root. Changing a
built-in demo never mutates or reseeds an existing root identity.

## B14. Cross-source resource transfer

The file manager exposes a `Transfer…` button for each transferable occurrence
while the resource graph is ready. The root workspace occurrence is protected
and has no transfer action. Activating the button opens a modal dialog containing
one destination-folder chooser and distinct `Move` and `Copy` buttons. This is
the complete pointer, touch, and keyboard interaction; there is no hidden drag
modifier or independent shortcut, and B8's same-pane resource drag remains a
no-op.

The selected occurrence and destination are stable source identities rather
than paths or names. Move is unavailable when the destination is the containing
folder. Copy is offered only for occurrences nominated as Automerge files, then
the exact document schema is checked before creation; folders and direct external
resources expose move only. Duplicate destination names remain valid.
The dialog cannot be dismissed after an operation starts until its receipt is
known, so partial work is not hidden by cancellation. It then reports complete,
no-op, blocked, failed, partial, or unknown state. Retrying reuses the same
operation identity and prepared basis; it does not silently start a new copy.
Closing returns focus to the surviving source action. A completed move, or a
move whose outcome is unknown, returns focus to the stable Files region instead.
Patchpit offers no transfer undo.

Relocation adds an exact destination occurrence before unlinking the source.
The referenced document keeps its identity, while the destination gets a new
source-local link ID. The unlink commits only if the source link's name,
resource reference, type hint, icon, and copy lineage still match the observed
intent. Concurrent source changes therefore leave both occurrences visible.
Moving to the same folder is a no-op. Relocating a folder into itself or a
reachable descendant rejects before mutation.

Copy supports exact Automerge file documents. It creates a new document identity
from the captured history, preserves unknown document fields, then links that
document at the destination with `copyOf` naming the immediate source document.
Folder documents and direct external resources are not copyable. A prepared copy
belongs to one open root lifecycle; using it after reopening rejects instead of
silently repeating a memory-only lifecycle operation.

Both operations require a ready, current, exact resource graph and re-project
state before each source-local step. Exact retries do not duplicate links or
documents. Stable-key collisions reject. Every attempted multi-source sequence
returns complete, partial, failed, or unknown evidence; a copy whose document
was created but could not be linked reports that document as orphaned. No
partial result is described as rollback.
