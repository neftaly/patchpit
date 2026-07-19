# Multiplayer Markdown editor review

Status: accepted direction for W4. This file leads the active implementation;
completed behavior moves to `behavior.md`, executable scenarios become browser or
fuzz coverage, and this review is removed when W4 is complete.

The review format borrows `lets-go`'s documentation method: separate a concise
product direction, implementation-neutral behavior, acceptance examples, and
adversarial challenges. State ownership and the upstream gate are appended here
because this is an active implementation review. `lets-go` is not a behavior
source, compatibility target, or editor architecture for Patchpit.

## Product brief

The Markdown app is a plain-source, multiplayer editor for one
Patchwork-compatible Automerge text document. Local input appears immediately,
canonical edits converge through Automerge, and temporary collaborator selections
are visible without becoming document history.

The editing surface is the product. It has no experiment heading, intent counter,
last-operation dump, save ceremony, toolbar, preview, formatting controls, or
undo control. A compact status surface may identify the local participant, other
present participants, and a state that prevents safe editing.

Undo is out of scope until its distributed semantics and canonical owner are
defined. Browser-local reversal must not pretend to undo changes already merged
from another replica.

## Behavior contract

### E1. Document binding

The bundled app requests the ordinary `demo.md` document relative to its own
folder. The host resolves that request within the app's granted document scope.
The app receives a detached text projection and opaque revision identity, never a
Repo, document handle, source, Tarstate service, iframe object, or credential.

The immutable application snapshot remains executable code and assets. It is not
the editable document and is not refreshed to save an edit.

### E2. Readiness

Editing is enabled only for a ready, current, exact, writable text projection.
Loading, incomplete, invalid, read-only, closed, and rejected states are distinct
and never appear as an empty document. Existing projected text remains visible
when that is safe. A failure never silently reloads the bundled seed.

### E3. Local input

Native EditContext and the pinned polyfill have the same observable behavior.
Text input, replacement, selection, pointer selection, and input-method
composition operate in JavaScript UTF-16 code-unit offsets at the browser
boundary. One completed input intent becomes a semantic text splice tied to the
exact source basis against which the user made it.

Local input paints immediately. Pending input is never silently discarded,
duplicated, or reapplied at an offset from a different projection. Rejection
keeps the unsaved local draft inspectable and pauses unsafe editing.

### E4. Concurrent durable edits

Each replica evaluates position-sensitive intent at its observed basis and lets
Automerge merge the resulting changes. A remote change does not turn a local
splice into whole-document replacement. Delivery order may alter Automerge's
deterministic character order, but every replica converges to equivalent text.

A stream of locally dependent, unacknowledged splices must preserve the character
identity introduced by earlier splices. Patchpit must not approximate this by
applying old numeric offsets to a newer merged string, serializing all writers,
or replacing the document.

### E5. Canonical replacement and selection

When canonical text changes, the app adopts the replacement projection. The
local selection is restored from Automerge-relative anchor and focus positions,
not clamped stale offsets. If an endpoint's referenced content was deleted,
Automerge's cursor movement policy determines its surviving adjacent position.

A canonical replacement does not recreate the EditContext, reset focus, scroll
to the start, or interrupt a compatible local selection.

### E6. Composition

Intermediate composition text is local and ephemeral. It is not committed or
broadcast as durable text. A completed composition emits one semantic splice
against the text present when composition began.

Remote durable changes received during composition do not replace the active
composition or move its candidate window. After an unchanged composition ends,
the queued canonical state is adopted. If both the composition and canonical
text changed, the visible local draft is retained and editing pauses unless the
completed intent can be reconciled through document-relative anchors.
Closing the editor or losing writability during composition reports interruption;
it does not publish a partial composition.

### E7. Participant identity and color

Every mounted editor session receives a fresh opaque session ID. A short
generated label and color are deterministic projections of that ID for the life
of the session; they are not accounts or durable profile data. Reloading may
produce a new identity.

Colors come from a fixed, host-approved palette with usable light and dark
contrast. A finite palette cannot promise global uniqueness, so labels accompany
colors wherever collaborators could otherwise be confused. Remote input cannot
inject CSS colors, names, markup, or participant IDs into the DOM.

### E8. Presence and remote selections

Presence is ephemeral per document. It carries mounted editor sessions and the
last Automerge cursor endpoints published for selection anchor and focus.
Selection direction is preserved. Blur retains the last cursor endpoints while
the session remains mounted; element or window focus is too transient to erase
a collaborator's useful location. A later selection replaces those endpoints,
and close or expiry removes them.

Remote carets and selections are paint-only overlays. They do not change text
wrapping, editor or scroll dimensions, hit testing, the local selection, or
assistive-technology text. A remote caret has a generated text label as well as a
color. Paint is withheld while the visible local buffer is an optimistic draft
or composition rather than the canonical projection; canonical cursor offsets
must not be applied to a different string. Participant join and leave changes
are not announced as document edits.

Closing normally removes the session immediately. Abrupt loss expires through
the presence transport's bounded time-to-live. Presence loss never removes or
rolls back durable text.

### E9. Port lifecycle and authority

The trusted sandbox and host communicate over one versioned MessagePort granted
for this app instance. The host validates the frame, origin, message shape,
revision, bounds, and authority before acting. Unknown, malformed, repeated, and
late messages are ignored or rejected without changing the document.

Closing the tab, replacing the root, remounting the app, or losing the frame
closes the port, document projection, transaction service, and local presence
session exactly once. A message from an old lifecycle cannot affect a new one.

### E10. Minimal visible chrome

The editor fills the application viewport. The only non-document surface is a
compact status/presence line. Ready state shows the local generated identity and
present collaborators without relying on color alone. Non-ready state explains
why editing is unavailable. Diagnostic splice JSON and test counters are never
product UI.

The editor remains one labeled multiline textbox. Status changes use an
appropriate polite live region; routine cursor motion does not create live
announcements.

## State ownership

| Fact | Owner | Boundary |
| --- | --- | --- |
| Markdown text and character identity | canonical Automerge file document | Tarstate text projection and semantic splice writer |
| Exact observed source basis | Tarstate projection/transaction lifecycle | opaque app revision mapped by the host |
| Local in-progress input and composition | sandbox editor runtime | semantic splice intent |
| Local selection while mounted | sandbox editor runtime | offset endpoints for the matching opaque revision |
| Shared selection positions | Automerge Repo Presence | host converts offsets to/from Automerge cursors |
| Session ID, generated label, and palette slot | Patchpit document-session runtime | detached participant projection |
| Application files | immutable sandbox snapshot | cache mount |
| Frame, port, authority, and cleanup | Patchpit host runtime | versioned MessagePort |

There is no second durable text buffer, presence document, save flag, or
application-owned Automerge replica.

## Acceptance scenarios

### A1. Open and remount

Given the demo editor is launched, it shows the live `demo.md` text and a
generated local identity. After a committed edit, closing and reopening the app
shows the edited text rather than the bundled seed.

### A2. Concurrent insertion

Given two independent Repos hold the same document at the same basis, each user
inserts different text without receiving the other's change. After arbitrary
change delivery, both editors show equivalent converged text and retain both
insertions.

### A3. Dependent rapid input

Given a user types characters whose later positions depend on earlier inserted
characters while a remote peer edits concurrently, no character is lost,
duplicated, or inserted relative to an unrelated remote character. This case is
required before the editor claims unrestricted continuous multiplayer editing.

### A4. Remote selection

Given two focused editors, moving or reversing one selection paints the same
logical range for the other user with a generated label and color. Inserting or
deleting before that range preserves its logical position after merge. Blurring
the first editor, switching windows, and hovering the second editor preserve its
last remote caret and participant identity.

### A5. Composition with a remote edit

Given one user is composing multi-stage input while another commits an edit, the
composition candidate remains stable and no intermediate composition text is
shared. Cancellation produces none and adopts the canonical change. Completion
either produces one safely anchored splice or retains the local draft and pauses
without mutating canonical text.

### A6. Readiness loss and rejection

Given a ready editor becomes incomplete, invalid, read-only, or closed, it does
not turn blank or continue unsafe writes. A rejected or unknown transaction keeps
the local draft visible, identifies its state, and does not report it as saved.

### A7. Presence loss

Given a collaborator closes normally, their caret and participant disappear
promptly. Given abrupt loss, they disappear after the bounded expiry. Durable
text remains in both cases.

### A8. Lifecycle replacement

Given an editor port belongs to an old root or frame, replacing that lifecycle
then sending an old valid-looking splice cannot mutate the replacement root.

### A9. Input parity and geometry

The native and polyfill paths pass the same text, selection, composition, and
pointer scenarios. Toggling local or remote caret/selection paint leaves editor
width, height, scroll width, scroll height, and line wrapping unchanged.

### A10. Accessibility

The textbox has a stable accessible name and multiline semantics. Generated
colors always have adjacent labels in the participant surface. Editing and
selection need no Patchpit-specific keyboard shortcuts, and presence motion does
not flood a screen reader.

### A11. Physical keyboard editing

Given the editor is focused at a collapsed caret, ordinary physical printable
keys, Space, Enter, Shift+Enter, Backspace, and Delete produce the same visible
and canonical plain-text result as the platform multiline text control. Given a
forward or reverse selection, insertion and deletion replace that exact range.
Direct browser text injection is setup evidence only and cannot stand in for
these keyboard cases.

Arrow navigation, visual-line navigation, Home/End, document-edge and word
modifiers, selection extension, and select-all preserve grapheme boundaries and
selection direction. Tab and Shift+Tab leave the editor without changing text.

### A12. Pointer and touch editing

Primary click and touch place a caret at the rendered character. Forward and
reverse drags select the corresponding text, Shift+click extends the existing
selection, double click selects a word, and triple click selects a visual line.
Middle and secondary buttons do not reposition the selection. These actions are
exercised at the start, middle, end, blank line, wrapped line, and scrolled
viewport edges.

### A13. Clipboard and Unicode

Copy preserves text, cut removes the selected range, and paste inserts plain
text—including multiple lines—at the active selection. Rich clipboard payloads
do not introduce markup. Editing adjacent to surrogate pairs, combining marks,
joined emoji, bidirectional text, and line boundaries never creates malformed
text or an invalid selection endpoint.

### A14. Passive interaction and viewport stability

Given a remote caret or selection is visible, moving the local pointer across
the editor text, remote paint, blank padding, scrollbar, and participant line
does not change or hide it. Local focus, selection movement, scrolling, and
resizing preserve remote paint whenever the visible text remains canonical.
Every passive action also preserves document text and revision, local selection,
participant membership, and scroll position except for the scroll action's own
requested axis.

A caret reached by navigation or editing is scrolled into view. Local and remote
paint follows wrapping, scroll, and resize without changing layout metrics or
text hit testing.

### A15. Focus, peers, and lifecycle

Blurring one editor preserves that session's last remote paint and participant;
refocusing and later selection continue from the same logical location. Local
tab changes and app remounting preserve canonical text and selection when the
owning source can still express it. Joining, closing, abruptly losing, and
rejoining peers cannot remove another participant or mutate durable text.
More participants than fit the compact surface remain represented by an
accessible count.

## Adversarial review

1. **A generated color is not identity.** Palette collisions are expected;
   generated labels and session IDs disambiguate them.
2. **Automerge heads are not user presence.** Durable history cannot reveal
   focus, selection, composition, or whether a replica is still online.
3. **Presence offsets are stale immediately.** Only Automerge cursors cross the
   replica boundary; numeric offsets remain local to one exact projection.
4. **A whole-string write is not collaborative text.** It would create scalar
   conflicts or overwrite intent, so only semantic text splices are writable.
5. **One successful concurrent-splice test is insufficient.** Locally dependent
   unacknowledged splices are a separate capability and acceptance case.
6. **Composition is not rapid typing.** Broadcasting its intermediate states can
   expose unstable text and corrupt input-method behavior.
7. **Same origin is not ambient authority.** The temporary trusted runner still
   receives a narrow port rather than host objects or raw document handles.
8. **A presence goodbye is not guaranteed.** Abrupt termination requires expiry;
   durable document correctness cannot depend on either signal.
9. **A status counter is test chrome.** Machine-observable attributes may support
   browser evidence, but visible diagnostics do not belong in the editor.
10. **Undo is distributed editing, not a local stack.** It stays absent until a
    semantic operation can state whose change is reversed and how concurrent
    changes survive.
11. **Text injection is not a keyboard test.** `insertText` can bypass keydown,
    default editing commands, modifier handling, and line-break behavior. The
    corpus needs physical keys as well as protocol-level text updates.
12. **One long journey hides branches.** A passing sequence tests only the state
    left by that sequence, while an early failure prevents later assertions.
    User actions need independently resettable cases with aggregated results.
13. **Hover is still an action.** Pointer movement is expected to be passive,
    so disappearing presence, selection, or paint is a correctness failure even
    when no click event fires.
14. **An offset test is not selection behavior.** Forward and reverse ranges,
    graphemes, visual lines, wrapped text, scrolling, word selection, focus, and
    pointer modality have distinct observable semantics.
15. **A remote caret appearing once is insufficient.** Its stability must be
    checked across every unrelated local action and through presence heartbeat
    timing, not only immediately after a remote edit.
16. **Blur is not departure.** Window managers, browser chrome, tool controls,
    and another editor can move focus without ending a participant session.
    Clearing selection on blur makes collaborator locations disappear during
    ordinary observation and navigation.

## Current action-corpus findings

The aggregated browser corpus currently passes 132 independently reported cases
across native EditContext, the forced polyfill, multiplayer presence, viewport
behavior, clipboard access, and touch. Mutable editing cases reset their fixture,
while lifecycle cases retain only the sequence they are explicitly testing.

Covered actions include physical printable input, line insertion, deletion and
selection replacement, line joining, grapheme-safe emoji and combining-mark
behavior, bidirectional insertion, select-all, horizontal and vertical
navigation, document-edge and word modifiers, forward and reverse pointer
drags, Shift+click, word and line multi-click selection, document-edge click,
plain-text copy/cut/paste with rich formatting discarded, non-mutating drop and
undo commands, caret reveal, passive hover and scroll, remote paint
through blur/focus/click/resize/scroll and a heartbeat, graceful close, abrupt
expiry, reverse remote selections, Tab focus escape, and primary touch
placement. The same editing cases run through native and forced-polyfill modes.

This is not the end of the corpus. Remaining environment-dependent work includes
real mobile virtual keyboards and selection handles; dead-key and more IME
families; rich/system clipboard payloads; text drag/drop and drag autoscroll;
wrapped bidirectional hit testing and horizontal scrolling; three-or-more-peer
overlap and participant overflow; abrupt process loss through full expiry;
screen-reader value/selection announcements; and non-Chromium platform keyboard
conventions where EditContext becomes available. These stay explicit rather
than being implied by the current passing cases.

## Current upstream gate

Released Tarstate correctly captures one text splice at an `observedBasis` and
reconciles that intent with later Automerge changes. It does not yet expose a
session or returned anchor that lets a consumer capture a second splice relative
to characters introduced by a still-unacknowledged first splice. A Patchpit-local
offset transform, hidden Automerge write, writer lock, or whole-document fallback
would violate E3 and E4.

Tarstate now has source-native feasibility evidence for retained Automerge
branches, buffered dependent splices, and deletion-aware relative cursors. That
reduces implementation uncertainty but does not yet provide the bounded session,
outcome, authority, and cleanup contract Patchpit can consume.

The host port, document projection, presence lifecycle, generated identities,
selection cursors, composition rules, minimal UI, and independently based
convergence evidence can proceed. Unrestricted continuous writes remain gated by
the consumer-independent capability described in the Tarstate proposal.
