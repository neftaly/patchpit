import type { DocHandle } from '@automerge/automerge-repo';
import { Automerge } from '@automerge/automerge-repo/slim';
import type { AutomergeHeadSet } from '@patchpit/system/runtime';

export function automergeHeadSetForHandle<T>(handle: DocHandle<T>): AutomergeHeadSet {
  return { [handle.url]: Automerge.getHeads(handle.doc() as Parameters<typeof Automerge.getHeads>[0]) };
}
