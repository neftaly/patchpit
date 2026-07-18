export type TextSelection = {
  readonly start: number;
  readonly end: number;
};

export type TextSpliceIntent = {
  readonly index: number;
  readonly deleteCount: number;
  readonly insert: string;
};

export type TextUpdate = TextSpliceIntent & {
  readonly selection: TextSelection;
};

export type TextInputSession = {
  readonly text: string;
  readonly selection: TextSelection;
  readonly compositionBasisText?: string;
};

export type TextInputIssue = 'range' | 'selection' | 'text';

export type TextNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

type TextInputTransition = {
  readonly session: TextInputSession;
  readonly intent?: TextSpliceIntent;
};

type TextUpdateParseResult = {
  readonly success: true;
  readonly value: TextUpdate;
} | {
  readonly success: false;
  readonly reason: TextInputIssue;
};

export const createTextInputSession = (text: string): TextInputSession => ({
  text,
  selection: { start: 0, end: 0 },
});

export const beginComposition = (session: TextInputSession): TextInputSession =>
  session.compositionBasisText === undefined
    ? { ...session, compositionBasisText: session.text }
    : session;

export const endComposition = (session: TextInputSession): TextInputTransition => {
  if (session.compositionBasisText === undefined) return { session };
  const intent = minimalTextSplice(session.compositionBasisText, session.text);
  const { compositionBasisText: _compositionBasisText, ...completed } = session;
  return {
    session: completed,
    ...(intent === undefined ? {} : { intent }),
  };
};

export const applyTextUpdate = (
  session: TextInputSession,
  update: TextUpdate,
): TextInputTransition => {
  const text = applyTextSplice(session.text, update);
  const next = {
    ...session,
    text,
    selection: update.selection,
  };
  return {
    session: next,
    ...(session.compositionBasisText === undefined && text !== session.text
      ? { intent: spliceFrom(update) }
      : {}),
  };
};

export const moveTextSelection = (
  session: TextInputSession,
  key: TextNavigationKey,
  extend: boolean,
): TextInputSession => {
  const { start, end } = session.selection;
  if (!extend && start !== end && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    const offset = key === 'ArrowLeft' ? Math.min(start, end) : Math.max(start, end);
    return { ...session, selection: { start: offset, end: offset } };
  }
  const focus = end;
  const next = key === 'ArrowLeft' ? previousGraphemeBoundary(session.text, focus)
    : key === 'ArrowRight' ? nextGraphemeBoundary(session.text, focus)
    : key === 'Home' ? lineStart(session.text, focus)
    : lineEnd(session.text, focus);
  return {
    ...session,
    selection: extend ? { start, end: next } : { start: next, end: next },
  };
};

export const selectAllText = (session: TextInputSession): TextInputSession => ({
  ...session,
  selection: { start: 0, end: session.text.length },
});

export const selectText = (
  session: TextInputSession,
  start: number,
  end: number,
): TextInputSession | undefined =>
  isOffset(start, session.text.length)
    && isOffset(end, session.text.length)
    && isCodePointBoundary(session.text, start)
    && isCodePointBoundary(session.text, end)
    ? { ...session, selection: { start, end } }
    : undefined;

export const parseTextUpdate = (
  currentText: string,
  candidate: {
    readonly index: unknown;
    readonly deleteCount: unknown;
    readonly insert: unknown;
    readonly selectionStart: unknown;
    readonly selectionEnd: unknown;
  },
): TextUpdateParseResult => {
  const { deleteCount, index, insert, selectionEnd, selectionStart } = candidate;
  if (!isNonNegativeInteger(index)
    || !isNonNegativeInteger(deleteCount)
    || index + deleteCount > currentText.length
    || !isCodePointBoundary(currentText, index)
    || !isCodePointBoundary(currentText, index + deleteCount)) {
    return { success: false, reason: 'range' };
  }
  if (typeof insert !== 'string' || !isWellFormedText(insert)) {
    return { success: false, reason: 'text' };
  }
  const nextText = currentText.slice(0, index) + insert + currentText.slice(index + deleteCount);
  if (!isOffset(selectionStart, nextText.length) || !isOffset(selectionEnd, nextText.length)) {
    return { success: false, reason: 'selection' };
  }
  if (!isCodePointBoundary(nextText, selectionStart)
    || !isCodePointBoundary(nextText, selectionEnd)) {
    return { success: false, reason: 'selection' };
  }
  return {
    success: true,
    value: {
      index,
      deleteCount,
      insert,
      selection: {
        start: selectionStart,
        end: selectionEnd,
      },
    },
  };
};

export const applyTextSplice = (text: string, splice: TextSpliceIntent) =>
  text.slice(0, splice.index) + splice.insert + text.slice(splice.index + splice.deleteCount);

export const minimalTextSplice = (
  before: string,
  after: string,
): TextSpliceIntent | undefined => {
  if (before === after) return undefined;
  let start = 0;
  const sharedLength = Math.min(before.length, after.length);
  while (start < sharedLength && before[start] === after[start]) start += 1;
  while (start > 0 && (bisectsSurrogatePair(before, start) || bisectsSurrogatePair(after, start))) {
    start -= 1;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start
    && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  while (bisectsSurrogatePair(before, beforeEnd) || bisectsSurrogatePair(after, afterEnd)) {
    beforeEnd += 1;
    afterEnd += 1;
  }
  return {
    index: start,
    deleteCount: beforeEnd - start,
    insert: after.slice(start, afterEnd),
  };
};

const spliceFrom = ({ index, deleteCount, insert }: TextUpdate): TextSpliceIntent => ({
  index,
  deleteCount,
  insert,
});

const isOffset = (value: unknown, maximum: number): value is number =>
  isNonNegativeInteger(value) && value <= maximum;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isCodePointBoundary = (text: string, offset: number) => !bisectsSurrogatePair(text, offset);

const bisectsSurrogatePair = (text: string, offset: number) =>
  offset > 0
  && offset < text.length
  && isHighSurrogate(text.charCodeAt(offset - 1))
  && isLowSurrogate(text.charCodeAt(offset));

const isHighSurrogate = (codeUnit: number) => codeUnit >= 0xD800 && codeUnit <= 0xDBFF;
const isLowSurrogate = (codeUnit: number) => codeUnit >= 0xDC00 && codeUnit <= 0xDFFF;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const previousGraphemeBoundary = (text: string, offset: number) => {
  let previous = 0;
  for (const segment of graphemeSegmenter.segment(text)) {
    if (segment.index >= offset) break;
    previous = segment.index;
  }
  return previous;
};

const nextGraphemeBoundary = (text: string, offset: number) => {
  for (const segment of graphemeSegmenter.segment(text)) {
    const end = segment.index + segment.segment.length;
    if (end > offset) return end;
  }
  return text.length;
};

const lineStart = (text: string, offset: number) =>
  offset === 0 ? 0 : text.lastIndexOf('\n', offset - 1) + 1;
const lineEnd = (text: string, offset: number) => {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline;
};

const isWellFormedText = (text: string) => text.isWellFormed();
