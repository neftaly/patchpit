import {
  isEditorConnectMessage,
  parseEditorHostMessage,
  type EditorDocumentSnapshot,
  type EditorPublicationResult,
} from '@patchpit/sandbox';
import type { TextSelection, TextSpliceIntent } from './input-session.ts';

export type EditorClient = ReturnType<typeof createEditorClient>;

export const createEditorClient = () => {
  let snapshot: EditorDocumentSnapshot = {
    state: 'loading',
    message: 'Connecting…',
    participants: [],
  };
  let port: MessagePort | undefined;
  let closed = false;
  const listeners = new Set<() => void>();
  const receipts = new Map<string, (result: EditorPublicationResult) => void>();
  const emit = () => { listeners.forEach((listener) => listener()); };
  const connected = (event: MessageEvent) => {
    if (closed
      || port !== undefined
      || event.source !== parent
      || event.origin !== location.origin
      || !isEditorConnectMessage(event.data)
      || event.ports.length !== 1) return;
    const connectedPort = event.ports[0];
    if (connectedPort === undefined) return;
    port = connectedPort;
    connectedPort.addEventListener('message', (messageEvent) => {
      const message = parseEditorHostMessage(messageEvent.data);
      if (message === undefined || closed) return;
      if (message.type === 'snapshot') {
        snapshot = message.snapshot;
        emit();
        return;
      }
      if (message.type === 'participants') {
        snapshot = { ...snapshot, participants: message.participants };
        emit();
        return;
      }
      receipts.get(message.requestId)?.({
        outcome: message.outcome,
        selection: message.selection,
      });
      receipts.delete(message.requestId);
    });
    connectedPort.start();
    connectedPort.postMessage({ type: 'open', path: ['demo.md'] });
  };
  window.addEventListener('message', connected);

  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('message', connected);
    window.removeEventListener('pagehide', close);
    port?.close();
    port = undefined;
    snapshot = {
      state: 'closed',
      message: 'Document closed.',
      participants: [],
    };
    for (const resolve of receipts.values()) {
      resolve({ outcome: 'unknown', selection: 'unresolved' });
    }
    receipts.clear();
    emit();
    listeners.clear();
  };
  window.addEventListener('pagehide', close, { once: true });

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    commitSplice: (
      revision: string,
      operation: TextSpliceIntent,
      selection: TextSelection,
    ): Promise<EditorPublicationResult> => {
      if (closed || port === undefined) {
        return Promise.resolve({ outcome: 'rejected', selection: 'unresolved' });
      }
      const requestId = crypto.randomUUID();
      return new Promise((resolve) => {
        receipts.set(requestId, resolve);
        port?.postMessage({
          type: 'splice',
          requestId,
          revision,
          ...operation,
          selectionAnchor: selection.start,
          selectionFocus: selection.end,
        });
      });
    },
    setSelection: (revision: string, selection: TextSelection) => {
      port?.postMessage({
        type: 'selection',
        revision,
        anchor: selection.start,
        focus: selection.end,
      });
    },
    close,
  };
};
