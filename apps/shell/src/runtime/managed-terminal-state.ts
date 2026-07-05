import type { DocHandle } from '@automerge/automerge-repo';
import {
  PatchpitType,
  type FolderDoc,
  type SeedFilesystem,
  type TerminalStateDoc,
} from '@patchpit/system';

export function managedTerminalStateHandles(
  seed: SeedFilesystem,
  systemApps: FolderDoc,
): readonly DocHandle<TerminalStateDoc>[] {
  return systemApps.docs.flatMap((entry) => {
    if (entry.type !== PatchpitType.TerminalState) return [];
    const handle = seed.documentHandles[entry.url];
    return handle === undefined ? [] : [handle as unknown as DocHandle<TerminalStateDoc>];
  });
}
