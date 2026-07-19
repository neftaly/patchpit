import type { DocHandle } from '@automerge/automerge-repo';
import type { FileRow } from '@patchpit/fs';
import { adoptConflictFreeAutomergeJsonValue } from '@tarstate/automerge/values';
import type { ObserverSnapshot } from '@tarstate/core/database/observer';
import { safeMaterializePortableBytes } from '@tarstate/core/values';

export type ResourceView = {
  readonly state: 'closed' | 'incomplete' | 'invalid' | 'stale';
} | {
  readonly content: string;
  readonly state: 'ready';
};

export type ResourceViewSource = {
  readonly getSnapshot: () => ResourceView;
  readonly subscribe: (listener: () => void) => () => void;
};

export const projectFileResourceView = (
  snapshot: ObserverSnapshot<FileRow>,
): ResourceView => {
  if (snapshot.state === 'closed') return { state: 'closed' };
  const { completeness, freshness, readiness, rows } = snapshot.current;
  if (readiness === 'invalid') return { state: 'invalid' };
  if (readiness !== 'ready' || completeness !== 'exact') return { state: 'incomplete' };
  if (freshness !== 'current') return { state: 'stale' };
  const file = rows.length === 1 ? rows[0] : undefined;
  if (file?.contentKind === 'text' && typeof file.textContent === 'string') {
    return { content: file.textContent, state: 'ready' };
  }
  if (file?.contentKind === 'binary' && file.binaryContent !== undefined) {
    const content = safeMaterializePortableBytes(file.binaryContent);
    return content.success
      ? { content: new TextDecoder().decode(content.value), state: 'ready' }
      : { state: 'invalid' };
  }
  return { state: 'invalid' };
};

export const projectAutomergeResourceView = (document: object | undefined): ResourceView => {
  if (document === undefined) return { state: 'invalid' };
  const adopted = adoptConflictFreeAutomergeJsonValue(document);
  return adopted.success
    ? { content: JSON.stringify(adopted.value, null, 2), state: 'ready' }
    : { state: 'invalid' };
};

export const createAutomergeResourceViewSource = <Document extends object>(
  handle: DocHandle<Document>,
): ResourceViewSource => {
  let snapshot = projectAutomergeResourceView(handle.doc());
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      const changed = () => {
        snapshot = projectAutomergeResourceView(handle.doc());
        listener();
      };
      handle.on('heads-changed', changed);
      return () => { handle.off('heads-changed', changed); };
    },
  };
};
