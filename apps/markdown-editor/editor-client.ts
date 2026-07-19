import {
  isEditorConnectMessage,
  parseEditorHostMessage,
  type EditorDocumentSnapshot,
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
  const receipts = new Map<string, (outcome: 'committed' | 'rejected' | 'unknown') => void>();
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
      receipts.get(message.requestId)?.(message.outcome);
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
    for (const resolve of receipts.values()) resolve('unknown');
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
    ): Promise<'committed' | 'rejected' | 'unknown'> => {
      if (closed || port === undefined) return Promise.resolve('rejected');
      const requestId = crypto.randomUUID();
      return new Promise((resolve) => {
        receipts.set(requestId, resolve);
        port?.postMessage({
          type: 'splice',
          requestId,
          revision,
          ...operation,
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
