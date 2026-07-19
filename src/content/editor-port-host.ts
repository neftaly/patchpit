import {
  EDITOR_CONNECT_MESSAGE,
  EDITOR_PROTOCOL_VERSION,
  parseEditorAppMessage,
  type EditorDocumentSnapshot,
} from '@patchpit/sandbox';
import type { EditorDocumentSession } from './editor-document-runtime.ts';
import type { PatchpitRuntime } from '../root/runtime.ts';

const MAX_INSERT_LENGTH = 1_048_576;
const MAX_REQUESTS_PER_PORT = 65_536;

type EditorPortRuntime = Pick<PatchpitRuntime, 'openAppTextDocument'>;

export const connectEditorFrame = (
  frame: HTMLIFrameElement,
  runtime: EditorPortRuntime,
  rootFolderRef: string,
) => {
  const contentWindow = frame.contentWindow;
  if (contentWindow === null) return () => undefined;
  const channel = new MessageChannel();
  const controller = new AbortController();
  let documentSession: EditorDocumentSession | undefined;
  let unsubscribe: () => void = () => undefined;
  let opened = false;
  let closed = false;
  let lastSnapshot: EditorDocumentSnapshot | undefined;
  const requestIds = new Set<string>();
  const postReceipt = (
    requestId: string,
    outcome: 'committed' | 'rejected' | 'unknown',
  ) => {
    if (!closed) channel.port1.postMessage({ type: 'receipt', requestId, outcome });
  };

  const postSnapshot = (snapshot: EditorDocumentSnapshot) => {
    if (closed) return;
    if (sameDocumentProjection(lastSnapshot, snapshot)) {
      channel.port1.postMessage({ type: 'participants', participants: snapshot.participants });
    } else {
      channel.port1.postMessage({ type: 'snapshot', snapshot });
    }
    lastSnapshot = snapshot;
  };
  const closeDocument = () => {
    unsubscribe();
    unsubscribe = () => undefined;
    documentSession?.close();
    documentSession = undefined;
  };
  const openDocument = async (path: readonly [string]) => {
    if (opened) return;
    opened = true;
    postSnapshot({
      state: 'loading',
      message: 'Opening document…',
      participants: [],
    });
    try {
      const session = await runtime.openAppTextDocument(rootFolderRef, path, controller.signal);
      if (closed) {
        session.close();
        return;
      }
      documentSession = session;
      const publish = () => postSnapshot(session.getSnapshot());
      unsubscribe = session.subscribe(publish);
      publish();
    } catch {
      if (!closed) postSnapshot({
        state: 'invalid',
        message: 'Document unavailable.',
        participants: [],
      });
    }
  };
  channel.port1.addEventListener('message', (event) => {
    const message = parseEditorAppMessage(event.data);
    if (message === undefined || closed) return;
    if (message.type === 'open') {
      void openDocument(message.path);
      return;
    }
    if (message.type === 'selection') {
      documentSession?.setSelection(message);
      return;
    }
    if (message.insert.length > MAX_INSERT_LENGTH
      || requestIds.has(message.requestId)
      || requestIds.size >= MAX_REQUESTS_PER_PORT) {
      postReceipt(message.requestId, 'rejected');
      return;
    }
    requestIds.add(message.requestId);
    const session = documentSession;
    if (session === undefined) {
      postReceipt(message.requestId, 'rejected');
      return;
    }
    void session.commitSplice(message.revision, {
      kind: 'file.text.splice',
      index: message.index,
      deleteCount: message.deleteCount,
      insert: message.insert,
    }).then((outcome) => {
      postReceipt(message.requestId, outcome);
    }, () => {
      postReceipt(message.requestId, 'unknown');
    });
  });
  channel.port1.start();
  contentWindow.postMessage({
    type: EDITOR_CONNECT_MESSAGE,
    version: EDITOR_PROTOCOL_VERSION,
  }, location.origin, [channel.port2]);

  return () => {
    if (closed) return;
    closed = true;
    controller.abort();
    closeDocument();
    channel.port1.close();
  };
};

const sameDocumentProjection = (
  left: EditorDocumentSnapshot | undefined,
  right: EditorDocumentSnapshot,
) => {
  if (left === undefined || left.state !== right.state) return false;
  if (left.state === 'ready' && right.state === 'ready') {
    return left.revision === right.revision && left.text === right.text;
  }
  if (left.state === 'ready' || right.state === 'ready') return false;
  return left.message === right.message && left.text === right.text;
};
