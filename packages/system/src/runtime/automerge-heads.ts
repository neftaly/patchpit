import { getHeads } from '@automerge/automerge';
import type { DocHandle } from '@automerge/automerge-repo';
import type { AutomergeHeadSet } from './protocol';

export function automergeHeadSetForHandle<T>(handle: DocHandle<T>): AutomergeHeadSet {
  return { [handle.url]: getHeads(handle.doc() as Parameters<typeof getHeads>[0]) };
}
