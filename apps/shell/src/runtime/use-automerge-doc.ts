import { useSyncExternalStore } from 'react';

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
