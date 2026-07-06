# File Drag/Drop Findings

Patchpit tried to make files in the sandboxed File Picker draggable into
WindowManager drop zones. The slice was reverted because it expanded across too
many ownership boundaries without producing a passing browser smoke test.

## What Worked

- File Picker could start a sandbox drag offer for a filesystem URL.
- `SandboxAppHost` could receive structured frame messages for drag start/end.
- WindowManager already has a usable placement model for tab and URL drops.
- Existing click and double-click file actions remain the reliable path for
  previewing and opening files.

## What Failed

- Cross-iframe release was unreliable. The shell could show a drag shield under
  the pointer, but the final release did not consistently commit `dropUrl`.
- Browser HTML drag/drop does not give the parent shell a reliable way to own or
  complete a real drag that originated inside a sandboxed iframe.
- Native drag/drop, iframe pointer events, shell overlays, and sandbox messages
  all wanted to own the same gesture lifecycle.
- Synthetic `DragEvent` tests proved plumbing, not real user drag/drop behavior.
  The real browser smoke could prove that a shield appeared, but not that a
  durable route intent was committed from the release.
- Source-surface exclusion was necessary so File Picker could keep normal
  in-app pointer behavior, but it made ownership transfer more subtle.

## Complexity Signals

- The attempted fix touched File Picker UI, the generated app bundle fixture,
  sandbox protocol parsing, app host lifecycle, shell state, WindowManager hit
  testing, and smoke infrastructure.
- The protocol shifted from a small drag offer to a partial pointer transport.
- Two drag models were active at once: native `DataTransfer` and custom
  `surface.drag.*` messages.
- The failure mode was browser-event ownership, not Tarstate state mutation.
  Adding more relation/state machinery would not make the browser deliver the
  right release event.

## Recommended Direction

- Keep WindowManager as the only owner of placement, drop zones, and context
  creation.
- Keep File Picker focused on semantic actions: select, preview, open, and
  eventually "offer this URL".
- Do not reintroduce cross-iframe dragging until the shell owns the full gesture
  from pointerdown through release.
- If sandboxed apps need draggable resources, expose a shell-owned drag service
  for URL offers. The app may declare the resource and initial pointer position,
  but the shell should own overlays, hit testing, cancellation, and final route
  intent submission.
- Keep native HTML drag/drop only for same-document or non-sandbox surfaces
  where `DataTransfer` is actually available to the owner of the drop.
- Preserve source-surface exclusion: dragging from inside an app must not place
  a drop shield over that same app surface.
