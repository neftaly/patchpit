import {
  getCursor,
  getCursorPosition,
  type Cursor,
  type Doc,
} from '@automerge/automerge';
import {
  Presence,
  type DocHandle,
  type PeerState,
} from '@automerge/automerge-repo';
import { mappedRelationRows, type AutomergeDatabase } from '@tarstate/automerge';
import type { SourceBasis } from '@tarstate/core/database';
import type {
  EditorDocumentSnapshot,
  EditorParticipant,
} from '@patchpit/sandbox';
import {
  commitTextFileSplice,
  fileRelation,
  type TextFileSpliceOperation,
} from '@patchpit/fs';

const TEXT_PATH = ['content'];
const MAX_CAPTURED_REVISIONS = 16;
const MAX_REMOTE_PEERS = 128;
const MAX_REMOTE_SESSIONS = 64;
const MAX_LOCAL_SESSIONS = 64;
const MAX_PROJECTED_PARTICIPANTS = 128;
const PARTICIPANT_COLOR_COUNT = 8;
const PRESENCE_HEARTBEAT_MS = 5_000;
const PRESENCE_PEER_TTL_MS = 15_000;
const MAX_EDITOR_TEXT_LENGTH = 16 * 1_024 * 1_024;

type PresenceSelection = {
  readonly anchor: Cursor;
  readonly focus: Cursor;
};

type PresenceSession = {
  readonly selection?: PresenceSelection;
};

type EditorPresence = {
  readonly sessions: Readonly<Record<string, PresenceSession>>;
};

type CapturedDocument = {
  readonly state: 'ready';
  readonly basis: SourceBasis;
  readonly document: Doc<object>;
  readonly revision: string;
  readonly text: string;
};

type UnavailableDocument = {
  readonly state: 'closed' | 'incomplete' | 'invalid' | 'read-only';
  readonly message: string;
};

type CurrentDocument = CapturedDocument | UnavailableDocument;

export type EditorDocumentSession = {
  readonly commitSplice: (
    revision: string,
    operation: TextFileSpliceOperation,
  ) => Promise<'committed' | 'rejected' | 'unknown'>;
  readonly getSnapshot: () => EditorDocumentSnapshot;
  readonly setSelection: (input: {
    readonly anchor: number;
    readonly focus: number;
    readonly revision: string;
  }) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly close: () => void;
};

export type EditorDocumentHub = {
  readonly openSession: () => EditorDocumentSession;
  readonly isIdle: () => boolean;
  readonly close: () => void;
};

export const createEditorDocumentHub = (
  handle: DocHandle<object>,
  database: AutomergeDatabase,
  onEmpty: () => void,
): EditorDocumentHub => {
  const presence = new Presence<EditorPresence>({ handle });
  const localSessions = new Map<string, PresenceSession>();
  const listeners = new Set<() => void>();
  const captures = new Map<string, CapturedDocument>();
  let currentDocument = captureDocument(handle, database);
  let closed = false;

  const retainCapture = (capture: CurrentDocument) => {
    currentDocument = capture;
    if (capture.state !== 'ready') return;
    captures.set(capture.revision, capture);
    while (captures.size > MAX_CAPTURED_REVISIONS) {
      const oldest = captures.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      captures.delete(oldest);
    }
  };
  retainCapture(currentDocument);
  const emit = () => { listeners.forEach((listener) => listener()); };
  const changed = () => {
    retainCapture(captureDocument(handle, database));
    emit();
  };
  const presenceChanged = () => { emit(); };
  const unsubscribeDatabase = database.subscribe(changed);
  presence.on('update', presenceChanged);
  presence.on('snapshot', presenceChanged);
  presence.on('goodbye', presenceChanged);
  presence.on('pruning', presenceChanged);
  presence.start({
    initialState: { sessions: {} },
    heartbeatMs: PRESENCE_HEARTBEAT_MS,
    peerTtlMs: PRESENCE_PEER_TTL_MS,
  });

  const broadcastSessions = () => {
    if (presence.running) presence.broadcast('sessions', Object.fromEntries(localSessions));
    emit();
  };
  const participants = (localSessionId: string): readonly EditorParticipant[] => {
    const current = handle.doc();
    const local = [...localSessions.keys()].map((sessionId) => participant(
      sessionId,
      sessionId === localSessionId,
      localSessions.get(sessionId)?.selection,
      current,
    ));
    const remote = Object.values(presence.getPeerStates().value)
      .slice(0, MAX_REMOTE_PEERS)
      .flatMap((peer) => remoteSessions(peer).map(([sessionId, session]) => participant(
        remoteSessionId(peer.peerId, sessionId),
        false,
        session.selection,
        current,
      )));
    return [...local, ...remote].sort((left, right) =>
      Number(right.sessionId === localSessionId) - Number(left.sessionId === localSessionId)
      || left.sessionId.localeCompare(right.sessionId)).slice(0, MAX_PROJECTED_PARTICIPANTS);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribeDatabase();
    presence.off('update', presenceChanged);
    presence.off('snapshot', presenceChanged);
    presence.off('goodbye', presenceChanged);
    presence.off('pruning', presenceChanged);
    presence.stop();
    localSessions.clear();
    captures.clear();
    listeners.clear();
    database.close();
  };

  const openSession = (): EditorDocumentSession => {
    if (closed) throw new Error('Editor document hub is closed');
    if (localSessions.size >= MAX_LOCAL_SESSIONS) throw new Error('Editor document session limit reached');
    const sessionId = crypto.randomUUID();
    let sessionClosed = false;
    localSessions.set(sessionId, {});
    broadcastSessions();
    const sessionListeners = new Set<() => void>();
    const notifySession = () => { sessionListeners.forEach((listener) => listener()); };
    listeners.add(notifySession);

    return {
      getSnapshot: () => projectSnapshot(currentDocument, participants(sessionId), closed || sessionClosed),
      subscribe: (listener) => {
        if (closed || sessionClosed) return () => undefined;
        sessionListeners.add(listener);
        return () => { sessionListeners.delete(listener); };
      },
      setSelection: ({ anchor, focus, revision }) => {
        if (closed || sessionClosed) return;
        const capture = captures.get(revision);
        if (capture === undefined) return;
        if (!validOffset(anchor, capture.text)
          || !validOffset(focus, capture.text)) return;
        localSessions.set(sessionId, {
          selection: {
            anchor: getCursor(capture.document, TEXT_PATH, anchor),
            focus: getCursor(capture.document, TEXT_PATH, focus),
          },
        });
        broadcastSessions();
      },
      commitSplice: async (revision, operation) => {
        if (closed || sessionClosed) return 'rejected';
        const capture = captures.get(revision);
        if (capture === undefined || !validSplice(operation, capture.text)) return 'rejected';
        const options = { observedBasis: capture.basis };
        const receipt = await commitTextFileSplice(database, operation, options);
        return receipt.outcome;
      },
      close: () => {
        if (sessionClosed) return;
        sessionClosed = true;
        listeners.delete(notifySession);
        sessionListeners.clear();
        localSessions.delete(sessionId);
        broadcastSessions();
        if (localSessions.size === 0) onEmpty();
      },
    };
  };

  return { openSession, isIdle: () => localSessions.size === 0, close };
};

const captureDocument = (
  handle: DocHandle<object>,
  database: AutomergeDatabase,
): CurrentDocument => {
  const snapshot = database.getSnapshot();
  const document = handle.doc();
  if (snapshot.state !== 'open') return { state: 'closed', message: 'Document closed.' };
  if (snapshot.current.readiness === 'invalid') {
    return { state: 'invalid', message: 'Document is invalid.' };
  }
  if (snapshot.current.readiness !== 'ready'
    || snapshot.current.completeness !== 'exact'
    || snapshot.current.freshness !== 'current'
    || document === undefined) {
    return { state: 'incomplete', message: 'Document is not ready for editing.' };
  }
  const rows = mappedRelationRows(snapshot.current, fileRelation);
  const row = rows.length === 1 ? rows[0] : undefined;
  if (row?.contentKind !== 'text' || typeof row.textContent !== 'string') {
    return { state: 'invalid', message: 'Document is not editable text.' };
  }
  if (row.textContent.length > MAX_EDITOR_TEXT_LENGTH) {
    return { state: 'incomplete', message: 'Document exceeds the editor size limit.' };
  }
  const textWrite = database.capabilities(fileRelation).fields.textContent?.textSplice;
  if (textWrite?.concurrency !== 'merge-captured-intent') {
    return { state: 'read-only', message: 'Document is read-only.' };
  }
  return {
    state: 'ready',
    basis: snapshot.current.basis,
    document,
    revision: crypto.randomUUID(),
    text: row.textContent,
  };
};

const projectSnapshot = (
  document: CurrentDocument,
  participants: readonly EditorParticipant[],
  closed: boolean,
): EditorDocumentSnapshot => {
  if (closed) return { state: 'closed', message: 'Document closed.', participants };
  if (document.state !== 'ready') return { ...document, participants };
  return {
    state: 'ready',
    revision: document.revision,
    text: document.text,
    participants,
  };
};

const remoteSessions = (
  peer: PeerState<EditorPresence>,
): readonly (readonly [string, PresenceSession])[] => {
  const value: unknown = peer.value;
  if (!isRecord(value)) return [];
  const sessions = value.sessions;
  if (!isRecord(sessions)) return [];
  const projected: (readonly [string, PresenceSession])[] = [];
  for (const sessionId in sessions) {
    if (projected.length >= MAX_REMOTE_SESSIONS) break;
    const candidate = sessions[sessionId];
    if (!Object.hasOwn(sessions, sessionId) || !isSessionId(sessionId) || !isRecord(candidate)) continue;
    if (candidate.selection === undefined) {
      projected.push([sessionId, {}]);
      continue;
    }
    const selection = candidate.selection;
    if (isRecord(selection)
      && typeof selection.anchor === 'string'
      && selection.anchor.length <= 1_024
      && typeof selection.focus === 'string'
      && selection.focus.length <= 1_024) {
      projected.push([sessionId, { selection: {
        anchor: selection.anchor as Cursor,
        focus: selection.focus as Cursor,
      } }]);
    }
  }
  return projected;
};

const remoteSessionId = (peerId: string, sessionId: string) =>
  `remote-${hashSessionId(peerId.slice(0, 128)).toString(16).padStart(8, '0')}-${sessionId}`;

const participant = (
  sessionId: string,
  local: boolean,
  selection: PresenceSelection | undefined,
  document: Doc<object> | undefined,
): EditorParticipant => {
  const identityHash = hashSessionId(sessionId);
  return {
    color: identityHash % PARTICIPANT_COLOR_COUNT,
    label: `User ${identityHash.toString(16).padStart(8, '0').slice(0, 4).toUpperCase()}`,
    local,
    sessionId,
    ...(selection === undefined || document === undefined ? {} : resolveSelection(document, selection)),
  };
};

const resolveSelection = (
  document: Doc<object>,
  selection: PresenceSelection,
): Pick<EditorParticipant, 'selection'> => {
  try {
    return { selection: {
      anchor: getCursorPosition(document, TEXT_PATH, selection.anchor),
      focus: getCursorPosition(document, TEXT_PATH, selection.focus),
    } };
  } catch {
    return {};
  }
};

const hashSessionId = (sessionId: string) => {
  let hash = 2_166_136_261;
  for (const character of sessionId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const validSplice = (operation: TextFileSpliceOperation, text: string) =>
  operation.kind === 'file.text.splice'
  && validOffset(operation.index, text)
  && Number.isSafeInteger(operation.deleteCount)
  && operation.deleteCount >= 0
  && operation.index + operation.deleteCount <= text.length
  && text.length - operation.deleteCount + operation.insert.length <= MAX_EDITOR_TEXT_LENGTH
  && !bisectsSurrogatePair(text, operation.index)
  && !bisectsSurrogatePair(text, operation.index + operation.deleteCount)
  && operation.insert.isWellFormed();

const validOffset = (offset: number, text: string) => Number.isSafeInteger(offset)
  && offset >= 0
  && offset <= text.length
  && !bisectsSurrogatePair(text, offset);

const bisectsSurrogatePair = (text: string, offset: number) => offset > 0
  && offset < text.length
  && /[\uD800-\uDBFF]/u.test(text[offset - 1] ?? '')
  && /[\uDC00-\uDFFF]/u.test(text[offset] ?? '');

const isSessionId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);

const isRecord = (candidate: unknown): candidate is Readonly<Record<string, unknown>> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
