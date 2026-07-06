import type { DocHandle } from '@automerge/automerge-repo';
import { useEffect, useState, useSyncExternalStore } from 'react';

export function useAutomergeDoc<T>(handle: DocHandle<T>): T {
  return useSyncExternalStore(
    (update) => {
      handle.on('change', update);
      return () => handle.off('change', update);
    },
    () => handle.doc(),
  );
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
