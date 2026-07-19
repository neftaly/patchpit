import type { FileRow } from '@patchpit/fs';
import type { ObserverSnapshot } from '@tarstate/core/database/observer';
import { safeMaterializePortableBytes } from '@tarstate/core/values';

export type ResourceFileView = {
  readonly state: 'closed' | 'incomplete' | 'invalid' | 'stale';
} | {
  readonly content: string;
  readonly state: 'ready';
};

export const projectResourceFileView = (
  snapshot: ObserverSnapshot<FileRow>,
): ResourceFileView => {
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
