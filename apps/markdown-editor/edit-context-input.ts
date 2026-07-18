import '@neftaly/editcontext-polyfill';
import {
  applyTextUpdate,
  beginComposition,
  createTextInputSession,
  endComposition,
  moveTextSelection,
  parseTextUpdate,
  selectAllText,
  selectText,
  type TextNavigationKey,
  type TextInputIssue,
  type TextInputSession,
  type TextSpliceIntent,
} from './input-session.ts';
import { caretBounds, characterBounds, textOffsetAtPoint } from './text-geometry.ts';

export type EditContextInputCallbacks = {
  readonly onCompositionInterrupted: (session: TextInputSession) => void;
  readonly onInputIssue: (reason: TextInputIssue) => void;
  readonly onSessionChange: (session: TextInputSession) => void;
  readonly onSpliceIntent: (intent: TextSpliceIntent) => void;
};

type EditContextInstance = EventTarget & {
  readonly text: string;
  readonly updateCharacterBounds: (rangeStart: number, bounds: DOMRect[]) => void;
  readonly updateControlBounds: (bounds: DOMRect) => void;
  readonly updateSelection: (start: number, end: number) => void;
  readonly updateSelectionBounds: (bounds: DOMRect) => void;
  readonly updateText: (rangeStart: number, rangeEnd: number, text: string) => void;
};

type EditContextHost = HTMLElement & {
  editContext: EditContextInstance | null;
};

type EditContextConstructor = new (options: { readonly text: string }) => EditContextInstance;

type PointerSelection = {
  readonly pointerId: number;
  readonly anchor: number;
};

/**
 * Experimental imperative browser boundary. It owns no document state and
 * emits UTF-16 splice intent; persistence and source reconciliation stay with
 * the eventual authority-scoped host transaction service.
 */
export const attachEditContextInput = (
  element: HTMLElement,
  initialText: string,
  callbacks: EditContextInputCallbacks,
) => {
  let session = createTextInputSession(initialText);
  let pointerSelection: PointerSelection | undefined;
  let layoutFrame: number | undefined;
  let requestedCharacterRange: { readonly start: number; readonly end: number } | undefined;
  const EditContextClass = (globalThis as { readonly EditContext?: EditContextConstructor }).EditContext;
  if (EditContextClass === undefined) throw new Error('EditContext is unavailable');
  const editContext = new EditContextClass({ text: initialText });
  const host = element as EditContextHost;
  const listeners = new AbortController();

  const updateLayout = () => {
    layoutFrame = undefined;
    editContext.updateControlBounds(host.getBoundingClientRect());
    const selection = caretBounds(host, session.selection.end);
    if (selection !== undefined) editContext.updateSelectionBounds(selection);
    if (requestedCharacterRange === undefined) return;
    const { start, end } = requestedCharacterRange;
    requestedCharacterRange = undefined;
    if (start < 0 || end < start || end > session.text.length) return;
    editContext.updateCharacterBounds(start, [...characterBounds(host, start, end)]);
  };
  const scheduleLayout = () => {
    if (layoutFrame === undefined) layoutFrame = requestAnimationFrame(updateLayout);
  };

  const publish = (next: TextInputSession, intent?: TextSpliceIntent) => {
    session = next;
    callbacks.onSessionChange(session);
    if (intent !== undefined) callbacks.onSpliceIntent(intent);
    scheduleLayout();
  };
  const publishSelection = (next: TextInputSession, intent?: TextSpliceIntent) => {
    editContext.updateSelection(next.selection.start, next.selection.end);
    publish(next, intent);
  };
  const handleTextUpdate = (event: Event) => {
    const input = event as Event & Readonly<Record<string, unknown>>;
    const parsed = parseTextUpdate(session.text, {
      index: input.updateRangeStart,
      deleteCount: typeof input.updateRangeStart === 'number'
        && typeof input.updateRangeEnd === 'number'
        ? input.updateRangeEnd - input.updateRangeStart
        : undefined,
      insert: input.text,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    });
    if (!parsed.success) {
      editContext.updateText(0, editContext.text.length, session.text);
      editContext.updateSelection(session.selection.start, session.selection.end);
      callbacks.onInputIssue(parsed.reason);
      return;
    }
    const transition = applyTextUpdate(session, parsed.value);
    publishSelection(transition.session, transition.intent);
  };
  const handleCompositionStart = () => { publish(beginComposition(session)); };
  const handleCompositionEnd = () => {
    const transition = endComposition(session);
    publish(transition.session, transition.intent);
  };
  const handleCharacterBoundsUpdate = (event: Event) => {
    const request = event as Event & Readonly<Record<string, unknown>>;
    if (!Number.isSafeInteger(request.rangeStart) || !Number.isSafeInteger(request.rangeEnd)) return;
    requestedCharacterRange = {
      start: request.rangeStart as number,
      end: request.rangeEnd as number,
    };
    scheduleLayout();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (session.compositionBasisText !== undefined || event.isComposing) return;
    if (isSelectAll(event)) {
      event.preventDefault();
      publishSelection(selectAllText(session));
      return;
    }
    if (!isNavigationKey(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    publishSelection(moveTextSelection(session, event.key, event.shiftKey));
  };
  const selectionOffset = (event: PointerEvent) =>
    textOffsetAtPoint(host, event.clientX, event.clientY);
  const handlePointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    const offset = selectionOffset(event);
    if (offset === undefined) return;
    const next = selectText(session, offset, offset);
    if (next === undefined) return;
    event.preventDefault();
    host.focus();
    pointerSelection = { pointerId: event.pointerId, anchor: offset };
    host.setPointerCapture(event.pointerId);
    publishSelection(next);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (pointerSelection?.pointerId !== event.pointerId) return;
    const offset = selectionOffset(event);
    if (offset === undefined) return;
    const next = selectText(session, pointerSelection.anchor, offset);
    if (next === undefined) return;
    event.preventDefault();
    publishSelection(next);
  };
  const endPointerSelection = (event: PointerEvent) => {
    if (pointerSelection?.pointerId !== event.pointerId) return;
    pointerSelection = undefined;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
  };

  editContext.addEventListener('textupdate', handleTextUpdate, { signal: listeners.signal });
  editContext.addEventListener('compositionstart', handleCompositionStart, { signal: listeners.signal });
  editContext.addEventListener('compositionend', handleCompositionEnd, { signal: listeners.signal });
  editContext.addEventListener('characterboundsupdate', handleCharacterBoundsUpdate, { signal: listeners.signal });
  host.addEventListener('keydown', handleKeyDown, { signal: listeners.signal });
  host.addEventListener('pointerdown', handlePointerDown, { signal: listeners.signal });
  host.addEventListener('pointermove', handlePointerMove, { signal: listeners.signal });
  host.addEventListener('pointerup', endPointerSelection, { signal: listeners.signal });
  host.addEventListener('pointercancel', endPointerSelection, { signal: listeners.signal });
  host.addEventListener('lostpointercapture', endPointerSelection, { signal: listeners.signal });
  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(host);
  window.addEventListener('resize', scheduleLayout, { signal: listeners.signal });
  window.addEventListener('scroll', scheduleLayout, { capture: true, signal: listeners.signal });
  host.editContext = editContext;
  callbacks.onSessionChange(session);
  scheduleLayout();

  return () => {
    const interruptedComposition = session.compositionBasisText === undefined ? undefined : session;
    const capturedPointerId = pointerSelection?.pointerId;
    listeners.abort();
    resizeObserver.disconnect();
    if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame);
    pointerSelection = undefined;
    if (capturedPointerId !== undefined && host.hasPointerCapture(capturedPointerId)) {
      host.releasePointerCapture(capturedPointerId);
    }
    if (host.editContext === editContext) host.editContext = null;
    if (interruptedComposition !== undefined) {
      callbacks.onCompositionInterrupted(interruptedComposition);
    }
  };
};

const isNavigationKey = (key: string): key is TextNavigationKey =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';

const isSelectAll = (event: KeyboardEvent) =>
  event.key.toLowerCase() === 'a'
  && (event.ctrlKey || event.metaKey)
  && !event.altKey;
