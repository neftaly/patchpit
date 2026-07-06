import type { DocHandle } from '@automerge/automerge-repo';
import { useEffect, useState, useSyncExternalStore } from 'react';

export type RuntimeDocumentStore = {
  getDocument<T = unknown>(url: string): T | undefined;
  subscribeDocument(url: string, listener: () => void): () => void;
};

export function useRuntimeDocument<T>(store: RuntimeDocumentStore, url: string): T {
  const document = useSyncExternalStore(
    (update) => store.subscribeDocument(url, update),
    () => store.getDocument<T>(url),
  );
  if (document === undefined) throw new Error(`Runtime document is unavailable: ${url}`);
  return document;
}

export function useAutomergeDocs<T>(handles: readonly DocHandle<T>[]): Readonly<Record<string, T>> {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const update = () => setVersion((current) => current + 1);
    for (const handle of handles) handle.on('change', update);
    return () => {
      for (const handle of handles) handle.off('change', update);
    };
  }, [handles]);

  return Object.fromEntries(handles.map((handle) => [handle.url, handle.doc()]));
}
