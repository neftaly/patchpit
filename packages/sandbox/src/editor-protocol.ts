export const EDITOR_PROTOCOL_VERSION = 2;
export const EDITOR_CONNECT_MESSAGE = 'patchpit.editor.connect';

export type EditorParticipant = {
  readonly color: number;
  readonly label: string;
  readonly local: boolean;
  readonly selection?: {
    readonly anchor: number;
    readonly focus: number;
  };
  readonly sessionId: string;
};

export type EditorDocumentSnapshot = {
  readonly state: 'ready';
  readonly revision: string;
  readonly text: string;
  readonly participants: readonly EditorParticipant[];
} | {
  readonly state: 'loading' | 'incomplete' | 'invalid' | 'read-only' | 'closed';
  readonly message: string;
  readonly text?: string;
  readonly participants: readonly EditorParticipant[];
};

export type EditorHostMessage = {
  readonly type: 'snapshot';
  readonly snapshot: EditorDocumentSnapshot;
} | {
  readonly type: 'participants';
  readonly participants: readonly EditorParticipant[];
} | {
  readonly type: 'receipt';
  readonly requestId: string;
  readonly outcome: 'committed' | 'rejected' | 'unknown';
};

export type EditorAppMessage = {
  readonly type: 'open';
  readonly path: readonly [string];
} | {
  readonly type: 'selection';
  readonly revision: string;
  readonly anchor: number;
  readonly focus: number;
} | {
  readonly type: 'splice';
  readonly requestId: string;
  readonly revision: string;
  readonly index: number;
  readonly deleteCount: number;
  readonly insert: string;
};

export const isEditorConnectMessage = (candidate: unknown) =>
  isRecord(candidate)
  && candidate.type === EDITOR_CONNECT_MESSAGE
  && candidate.version === EDITOR_PROTOCOL_VERSION;

export const parseEditorAppMessage = (candidate: unknown): EditorAppMessage | undefined => {
  if (!isRecord(candidate) || typeof candidate.type !== 'string') return undefined;
  if (candidate.type === 'open') {
    return Array.isArray(candidate.path)
      && candidate.path.length === 1
      && typeof candidate.path[0] === 'string'
      && validPathSegment(candidate.path[0])
      ? { type: 'open', path: [candidate.path[0]] }
      : undefined;
  }
  if (candidate.type === 'selection') {
    return validToken(candidate.revision)
      && validOffset(candidate.anchor)
      && validOffset(candidate.focus)
      ? {
          type: 'selection',
          revision: candidate.revision,
          anchor: candidate.anchor,
          focus: candidate.focus,
        }
      : undefined;
  }
  if (candidate.type !== 'splice'
    || !validToken(candidate.requestId)
    || !validToken(candidate.revision)
    || !validOffset(candidate.index)
    || !validOffset(candidate.deleteCount)
    || typeof candidate.insert !== 'string'
    || !candidate.insert.isWellFormed()) return undefined;
  return {
    type: 'splice',
    requestId: candidate.requestId,
    revision: candidate.revision,
    index: candidate.index,
    deleteCount: candidate.deleteCount,
    insert: candidate.insert,
  };
};

export const parseEditorHostMessage = (candidate: unknown): EditorHostMessage | undefined => {
  if (!isRecord(candidate) || typeof candidate.type !== 'string') return undefined;
  if (candidate.type === 'receipt') {
    return validToken(candidate.requestId)
      && (candidate.outcome === 'committed'
        || candidate.outcome === 'rejected'
        || candidate.outcome === 'unknown')
      ? { type: 'receipt', requestId: candidate.requestId, outcome: candidate.outcome }
      : undefined;
  }
  if (candidate.type === 'participants') {
    const participants = parseParticipants(candidate.participants);
    return participants === undefined ? undefined : { type: 'participants', participants };
  }
  if (candidate.type !== 'snapshot') return undefined;
  const snapshot = parseSnapshot(candidate.snapshot);
  return snapshot === undefined ? undefined : { type: 'snapshot', snapshot };
};

const parseSnapshot = (candidate: unknown): EditorDocumentSnapshot | undefined => {
  if (!isRecord(candidate)) return undefined;
  const parsedParticipants = parseParticipants(candidate.participants);
  if (parsedParticipants === undefined) return undefined;
  if (candidate.state === 'ready') {
    const text = candidate.text;
    return validToken(candidate.revision)
      && typeof text === 'string'
      && text.isWellFormed()
      && parsedParticipants.every(({ selection }) => selection === undefined
        || (selection.anchor <= text.length
          && selection.focus <= text.length
          && codePointBoundary(text, selection.anchor)
          && codePointBoundary(text, selection.focus)))
      ? {
          state: 'ready',
          revision: candidate.revision,
          text,
          participants: parsedParticipants,
        }
      : undefined;
  }
  return (candidate.state === 'loading'
    || candidate.state === 'incomplete'
    || candidate.state === 'invalid'
    || candidate.state === 'read-only'
    || candidate.state === 'closed')
    && typeof candidate.message === 'string'
    && (candidate.text === undefined
      || (typeof candidate.text === 'string' && candidate.text.isWellFormed()))
    ? {
        state: candidate.state,
        message: candidate.message,
        ...(candidate.text === undefined ? {} : { text: candidate.text }),
        participants: parsedParticipants,
      }
    : undefined;
};

const parseParticipants = (candidate: unknown): readonly EditorParticipant[] | undefined => {
  if (!Array.isArray(candidate) || candidate.length > 128) return undefined;
  const participants = candidate.map(parseParticipant);
  if (participants.some((participant) => participant === undefined)) return undefined;
  const parsed = participants as EditorParticipant[];
  const sessionIds = new Set(parsed.map(({ sessionId }) => sessionId));
  return sessionIds.size === parsed.length && parsed.filter(({ local }) => local).length <= 1
    ? parsed
    : undefined;
};

const parseParticipant = (candidate: unknown): EditorParticipant | undefined => {
  if (!isRecord(candidate)
    || !validToken(candidate.sessionId)
    || typeof candidate.label !== 'string'
    || candidate.label.length === 0
    || candidate.label.length > 32
    || !Number.isSafeInteger(candidate.color)
    || (candidate.color as number) < 0
    || (candidate.color as number) > 7
    || typeof candidate.local !== 'boolean') return undefined;
  const selection = candidate.selection;
  if (selection !== undefined && (!isRecord(selection)
    || !validOffset(selection.anchor)
    || !validOffset(selection.focus))) return undefined;
  return {
    color: candidate.color as number,
    label: candidate.label,
    local: candidate.local,
    sessionId: candidate.sessionId,
    ...(selection === undefined ? {} : {
      selection: {
        anchor: (selection as { readonly anchor: number }).anchor,
        focus: (selection as { readonly focus: number }).focus,
      },
    }),
  };
};

const validPathSegment = (value: string) => value.length > 0
  && value.length <= 255
  && value !== '.'
  && value !== '..'
  && !value.includes('/')
  && !value.includes('\\')
  && !value.includes('\0');

const validToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

const validOffset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const codePointBoundary = (text: string, offset: number) => !(offset > 0
  && offset < text.length
  && /[\uD800-\uDBFF]/u.test(text[offset - 1] ?? '')
  && /[\uDC00-\uDFFF]/u.test(text[offset] ?? ''));

const isRecord = (candidate: unknown): candidate is Readonly<Record<string, unknown>> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
