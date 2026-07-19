import '@neftaly/editcontext-polyfill';
import {
  applyTextUpdate,
  beginComposition,
  createTextInputSession,
  deleteText,
  endComposition,
  moveTextSelectionByWord,
  moveTextSelection,
  moveTextSelectionTo,
  moveTextSelectionToDocumentEdge,
  parseTextUpdate,
  replaceTextSelection,
  selectAllText,
  selectLineAt,
  selectedText,
  selectText,
  selectWordAt,
  type TextInputTransition,
  type TextNavigationKey,
  type TextSelection,
  type TextInputIssue,
  type TextInputSession,
  type TextSpliceIntent,
} from './input-session.ts';
import { caretBounds, characterBounds, textOffsetAtPoint } from './text-geometry.ts';

export type EditContextInputCallbacks = {
  readonly onCompositionEnd: (changed: boolean) => void;
  readonly onCompositionInterrupted: (session: TextInputSession) => void;
  readonly onInputIssue: (reason: TextInputIssue) => void;
  readonly onSessionChange: (session: TextInputSession) => void;
  readonly onSpliceIntent: (intent: TextSpliceIntent) => void;
};

export type AttachedEditContextInput = {
  readonly close: () => void;
  readonly replace: (text: string, selection: TextSelection) => boolean;
  readonly setReadOnly: (readOnly: boolean) => void;
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

type PrimaryPointerSequence = {
  readonly count: number;
  readonly offset: number;
  readonly time: number;
};

const MULTI_CLICK_INTERVAL_MS = 500;
const DEFAULT_LINE_HEIGHT_PX = 16;

/**
 * Imperative browser boundary. It owns no canonical document state and emits
 * UTF-16 splice intent; persistence and source reconciliation stay with the
 * authority-scoped host transaction service.
 */
export const attachEditContextInput = (
  element: HTMLElement,
  initialText: string,
  callbacks: EditContextInputCallbacks,
): AttachedEditContextInput => {
  let session = createTextInputSession(initialText);
  let pointerSelection: PointerSelection | undefined;
  let primaryPointerSequence: PrimaryPointerSequence | undefined;
  let layoutFrame: number | undefined;
  let revealCaretOnLayout = false;
  let preferredInlineCoordinate: number | undefined;
  let suppressAuxiliaryInput = false;
  let auxiliaryResetTimer: number | undefined;
  let requestedCharacterRange: { readonly start: number; readonly end: number } | undefined;
  const EditContextClass = (globalThis as { readonly EditContext?: EditContextConstructor }).EditContext;
  if (EditContextClass === undefined) throw new Error('EditContext is unavailable');
  const editContext = new EditContextClass({ text: initialText });
  const host = element as EditContextHost;
  const listeners = new AbortController();

  const updateLayout = () => {
    layoutFrame = undefined;
    const revealCaret = revealCaretOnLayout;
    revealCaretOnLayout = false;
    const control = host.getBoundingClientRect();
    editContext.updateControlBounds(control);
    const selection = caretBounds(host, session.selection.end);
    if (selection !== undefined) {
      editContext.updateSelectionBounds(selection);
      const caret = host.querySelector<HTMLElement>('[data-editor-caret]');
      if (caret !== null) {
        caret.style.insetInlineStart = `${selection.left - control.left - host.clientLeft + host.scrollLeft}px`;
        caret.style.insetBlockStart = `${selection.top - control.top - host.clientTop + host.scrollTop}px`;
        caret.style.blockSize = `${selection.height}px`;
      }
      if (revealCaret && revealBounds(host, control, selection)) {
        scheduleLayout();
        return;
      }
    }
    if (requestedCharacterRange === undefined) return;
    const { start, end } = requestedCharacterRange;
    requestedCharacterRange = undefined;
    if (start < 0 || end < start || end > session.text.length) return;
    editContext.updateCharacterBounds(start, [...characterBounds(host, start, end)]);
  };
  function scheduleLayout(revealCaret = false) {
    revealCaretOnLayout ||= revealCaret;
    if (layoutFrame === undefined) layoutFrame = requestAnimationFrame(updateLayout);
  }
  function finishAuxiliaryInputSuppression() {
    suppressAuxiliaryInput = false;
    if (auxiliaryResetTimer !== undefined) window.clearTimeout(auxiliaryResetTimer);
    auxiliaryResetTimer = undefined;
  }

  const publish = (next: TextInputSession, intent?: TextSpliceIntent, revealCaret = false) => {
    session = next;
    callbacks.onSessionChange(session);
    if (intent !== undefined) callbacks.onSpliceIntent(intent);
    scheduleLayout(revealCaret);
  };
  const publishSelection = (
    next: TextInputSession,
    intent?: TextSpliceIntent,
    revealCaret = false,
  ) => {
    editContext.updateSelection(next.selection.start, next.selection.end);
    publish(next, intent, revealCaret);
  };
  const publishTransition = (transition: TextInputTransition) => {
    const { session: next, intent } = transition;
    if (intent !== undefined) {
      editContext.updateText(intent.index, intent.index + intent.deleteCount, intent.insert);
    }
    preferredInlineCoordinate = undefined;
    publishSelection(next, intent, true);
  };
  const handleTextUpdate = (event: Event) => {
    if (suppressAuxiliaryInput) {
      editContext.updateText(0, editContext.text.length, session.text);
      editContext.updateSelection(session.selection.start, session.selection.end);
      finishAuxiliaryInputSuppression();
      return;
    }
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
    preferredInlineCoordinate = undefined;
    publishSelection(transition.session, transition.intent, true);
  };
  const handleCompositionStart = () => { publish(beginComposition(session)); };
  const handleCompositionEnd = () => {
    const transition = endComposition(session);
    publish(transition.session, transition.intent);
    callbacks.onCompositionEnd(transition.intent !== undefined);
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
    if (isUndoOrRedo(event)) {
      event.preventDefault();
      return;
    }
    if (isSelectAll(event)) {
      event.preventDefault();
      preferredInlineCoordinate = undefined;
      publishSelection(selectAllText(session));
      return;
    }
    const commandModifier = event.ctrlKey || event.metaKey;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (event.altKey || commandModifier) return;
      event.preventDefault();
      const moved = moveSelectionVertically(
        host,
        session,
        event.key === 'ArrowUp' ? 'up' : 'down',
        event.shiftKey,
        preferredInlineCoordinate,
      );
      preferredInlineCoordinate = moved.inlineCoordinate;
      publishSelection(moved.session, undefined, true);
      return;
    }
    if (isNavigationKey(event.key)) {
      if (event.altKey) return;
      event.preventDefault();
      preferredInlineCoordinate = undefined;
      const next = commandModifier
        ? event.key === 'Home' || event.key === 'End'
          ? moveTextSelectionToDocumentEdge(
            session,
            event.key === 'Home' ? 'start' : 'end',
            event.shiftKey,
          )
          : moveTextSelectionByWord(
            session,
            event.key === 'ArrowLeft' ? 'backward' : 'forward',
            event.shiftKey,
          )
        : moveTextSelection(session, event.key, event.shiftKey);
      publishSelection(next, undefined, true);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      if (event.altKey) return;
      event.preventDefault();
      publishTransition(deleteText(
        session,
        event.key === 'Backspace' ? 'backward' : 'forward',
        commandModifier ? 'word' : 'grapheme',
      ));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      publishTransition(replaceTextSelection(session, '\n'));
      return;
    }
    if (isPrintableKey(event)) {
      event.preventDefault();
      publishTransition(replaceTextSelection(session, event.key));
    }
  };
  const selectionOffset = (event: PointerEvent) =>
    textOffsetAtPoint(host, event.clientX, event.clientY);
  const handlePointerDown = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    if (event.button !== 0) {
      suppressAuxiliaryInput = true;
      event.preventDefault();
      return;
    }
    const offset = selectionOffset(event);
    if (offset === undefined) return;
    const priorSequence = primaryPointerSequence;
    const continuedSequence = priorSequence !== undefined
      && event.timeStamp - priorSequence.time < MULTI_CLICK_INTERVAL_MS
      && offset === priorSequence.offset;
    const clickCount = continuedSequence ? Math.min(priorSequence.count + 1, 3) : 1;
    primaryPointerSequence = { count: clickCount, offset, time: event.timeStamp };
    const next = clickCount >= 3
      ? selectLineAt(session, offset)
      : clickCount === 2
        ? selectWordAt(session, offset)
        : selectText(
          session,
          event.shiftKey ? session.selection.start : offset,
          offset,
        );
    if (next === undefined) return;
    event.preventDefault();
    host.focus();
    preferredInlineCoordinate = undefined;
    pointerSelection = {
      pointerId: event.pointerId,
      anchor: clickCount > 1 ? next.selection.start
        : event.shiftKey ? session.selection.start : offset,
    };
    host.setPointerCapture(event.pointerId);
    publishSelection(next);
  };
  const suppressAuxiliaryActivation = (event: PointerEvent) => {
    event.preventDefault();
  };
  const endAuxiliaryPointer = (event: PointerEvent) => {
    if (event.button === 0) return;
    if (auxiliaryResetTimer !== undefined) window.clearTimeout(auxiliaryResetTimer);
    auxiliaryResetTimer = window.setTimeout(finishAuxiliaryInputSuppression);
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
  const handleCopy = (event: ClipboardEvent) => {
    const selected = selectedText(session);
    if (selected.length === 0 || event.clipboardData === null) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', selected);
  };
  const handleCut = (event: ClipboardEvent) => {
    const selected = selectedText(session);
    if (selected.length === 0 || event.clipboardData === null) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', selected);
    publishTransition(replaceTextSelection(session, ''));
  };
  const handlePaste = (event: ClipboardEvent) => {
    if (event.clipboardData === null) return;
    event.preventDefault();
    if (suppressAuxiliaryInput) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text.isWellFormed()) {
      callbacks.onInputIssue('text');
      return;
    }
    publishTransition(replaceTextSelection(session, text));
  };
  const suppressDrop = (event: DragEvent) => { event.preventDefault(); };

  editContext.addEventListener('textupdate', handleTextUpdate, { signal: listeners.signal });
  editContext.addEventListener('compositionstart', handleCompositionStart, { signal: listeners.signal });
  editContext.addEventListener('compositionend', handleCompositionEnd, { signal: listeners.signal });
  editContext.addEventListener('characterboundsupdate', handleCharacterBoundsUpdate, { signal: listeners.signal });
  host.addEventListener('keydown', handleKeyDown, { signal: listeners.signal });
  host.addEventListener('pointerdown', handlePointerDown, { signal: listeners.signal });
  host.addEventListener('auxclick', suppressAuxiliaryActivation, { signal: listeners.signal });
  host.addEventListener('contextmenu', finishAuxiliaryInputSuppression, {
    signal: listeners.signal,
  });
  host.addEventListener('pointermove', handlePointerMove, { signal: listeners.signal });
  host.addEventListener('pointerup', endPointerSelection, { signal: listeners.signal });
  host.addEventListener('pointercancel', endPointerSelection, { signal: listeners.signal });
  host.addEventListener('lostpointercapture', endPointerSelection, { signal: listeners.signal });
  host.addEventListener('copy', handleCopy, { signal: listeners.signal });
  host.addEventListener('cut', handleCut, { signal: listeners.signal });
  host.addEventListener('paste', handlePaste, { signal: listeners.signal });
  host.addEventListener('dragover', suppressDrop, { signal: listeners.signal });
  host.addEventListener('drop', suppressDrop, { signal: listeners.signal });
  host.addEventListener('focus', () => { scheduleLayout(true); }, { signal: listeners.signal });
  const requestLayout = () => { scheduleLayout(); };
  const resizeObserver = new ResizeObserver(requestLayout);
  resizeObserver.observe(host);
  window.addEventListener('resize', requestLayout, { signal: listeners.signal });
  window.addEventListener('scroll', requestLayout, { capture: true, signal: listeners.signal });
  window.addEventListener('pointerup', endAuxiliaryPointer, {
    capture: true,
    signal: listeners.signal,
  });
  window.addEventListener('pointercancel', endAuxiliaryPointer, {
    capture: true,
    signal: listeners.signal,
  });
  host.editContext = editContext;
  callbacks.onSessionChange(session);
  scheduleLayout();

  const setReadOnly = (nextReadOnly: boolean) => {
    if (host.editContext === editContext && nextReadOnly) host.editContext = null;
    if (host.editContext === null && !nextReadOnly) host.editContext = editContext;
  };
  const replace = (text: string, selection: TextSelection) => {
    const replacement = selectText(createTextInputSession(text), selection.start, selection.end);
    if (session.compositionBasisText !== undefined || replacement === undefined) return false;
    editContext.updateText(0, editContext.text.length, text);
    editContext.updateSelection(selection.start, selection.end);
    publish(replacement);
    return true;
  };
  const close = () => {
    const interruptedComposition = session.compositionBasisText === undefined ? undefined : session;
    const capturedPointerId = pointerSelection?.pointerId;
    listeners.abort();
    resizeObserver.disconnect();
    if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame);
    if (auxiliaryResetTimer !== undefined) window.clearTimeout(auxiliaryResetTimer);
    pointerSelection = undefined;
    if (capturedPointerId !== undefined && host.hasPointerCapture(capturedPointerId)) {
      host.releasePointerCapture(capturedPointerId);
    }
    if (host.editContext === editContext) host.editContext = null;
    if (interruptedComposition !== undefined) {
      callbacks.onCompositionInterrupted(interruptedComposition);
    }
  };
  return { close, replace, setReadOnly };
};

const isNavigationKey = (key: string): key is TextNavigationKey =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';

const isSelectAll = (event: KeyboardEvent) =>
  event.key.toLowerCase() === 'a'
  && (event.ctrlKey || event.metaKey)
  && !event.altKey;

const isUndoOrRedo = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey)
  && !event.altKey
  && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y');

const isPrintableKey = (event: KeyboardEvent) =>
  !event.altKey
  && !event.ctrlKey
  && !event.metaKey
  && event.key !== 'Dead'
  && event.key !== 'Unidentified'
  && isSingleGrapheme(event.key);

const keySegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const isSingleGrapheme = (text: string) => {
  const segments = keySegmenter.segment(text)[Symbol.iterator]();
  return !segments.next().done && segments.next().done === true;
};

const moveSelectionVertically = (
  host: HTMLElement,
  session: TextInputSession,
  direction: 'up' | 'down',
  extend: boolean,
  preferredInlineCoordinate: number | undefined,
) => {
  const caret = caretBounds(host, session.selection.end);
  if (caret === undefined) return { session, inlineCoordinate: preferredInlineCoordinate };
  const inlineCoordinate = preferredInlineCoordinate ?? caret.left;
  const lineHeight = resolvedLineHeight(host, caret.height);
  const targetY = direction === 'up'
    ? caret.top - lineHeight / 2
    : caret.bottom + lineHeight / 2;
  const text = host.querySelector<HTMLElement>('.editor-text');
  const textBounds = text?.getBoundingClientRect();
  const offset = textBounds !== undefined && targetY < textBounds.top
    ? 0
    : textBounds !== undefined && targetY > textBounds.bottom
      ? session.text.length
      : textOffsetAtPoint(host, inlineCoordinate, targetY);
  return {
    session: offset === undefined ? session : moveTextSelectionTo(session, offset, extend),
    inlineCoordinate,
  };
};

const resolvedLineHeight = (host: HTMLElement, measured: number) => {
  const parsed = Number.parseFloat(getComputedStyle(host).lineHeight);
  return Number.isFinite(parsed) ? parsed : measured > 0 ? measured : DEFAULT_LINE_HEIGHT_PX;
};

const revealBounds = (host: HTMLElement, control: DOMRect, caret: DOMRect) => {
  const viewportTop = control.top + host.clientTop;
  const viewportLeft = control.left + host.clientLeft;
  const viewportBottom = viewportTop + host.clientHeight;
  const viewportRight = viewportLeft + host.clientWidth;
  let blockDelta = 0;
  let inlineDelta = 0;
  if (caret.top < viewportTop) blockDelta = caret.top - viewportTop;
  else if (caret.bottom > viewportBottom) blockDelta = caret.bottom - viewportBottom;
  if (caret.left < viewportLeft) inlineDelta = caret.left - viewportLeft;
  else if (caret.right > viewportRight) inlineDelta = caret.right - viewportRight;
  if (blockDelta === 0 && inlineDelta === 0) return false;
  host.scrollBy({ left: inlineDelta, top: blockDelta });
  return true;
};
