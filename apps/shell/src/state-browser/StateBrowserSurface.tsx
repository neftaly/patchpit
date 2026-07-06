import type { DocHandle } from '@automerge/automerge-repo';
import { useMemo, useSyncExternalStore } from 'react';
import {
  PatchpitType,
  type SeedFilesystem,
} from '@patchpit/system';
import type { BootstrapRuntimeClient } from '../runtime/bootstrap-runtime';
import { useAutomergeDocs } from '../runtime/use-automerge-doc';
import {
  createStateBrowserSnapshot,
  StateBrowser,
  type StateBrowserSnapshotInput,
} from './StateBrowser';

type StateBrowserSurfaceProps = Omit<StateBrowserSnapshotInput, 'runtimeDiagnostics' | 'stateDocuments'> & {
  readonly runtime: BootstrapRuntimeClient;
  readonly seed: SeedFilesystem;
};

export function StateBrowserSurface({
  filesystemProjection,
  runtime,
  runtimeAck,
  runtimeIssue,
  runtimeIssueHistory,
  runtimePlatform,
  runtimeState,
  seed,
  workspaceProjection,
}: StateBrowserSurfaceProps) {
  const runtimeDiagnostics = useRuntimeDiagnostics(runtime);
  const stateHandles = useMemo(() => inspectableStateDocumentHandles(seed), [seed, runtimeState]);
  const stateDocuments = useAutomergeDocs(stateHandles);

  return (
    <StateBrowser
      snapshot={createStateBrowserSnapshot({
        filesystemProjection,
        runtimeAck,
        runtimeDiagnostics,
        runtimeIssue,
        runtimeIssueHistory,
        runtimePlatform,
        runtimeState,
        stateDocuments,
        workspaceProjection,
      })}
    />
  );
}

function inspectableStateDocumentHandles(seed: SeedFilesystem): readonly DocHandle<unknown>[] {
  return [
    seed.indexHandle as DocHandle<unknown>,
    ...Object.values(seed.documentHandles)
      .filter((handle) => {
        const type = handle.doc()['@patchpit'].type;
        return type !== PatchpitType.File && type !== PatchpitType.Folder;
      })
      .map((handle) => handle as DocHandle<unknown>),
  ];
}

function useRuntimeDiagnostics(runtime: BootstrapRuntimeClient) {
  return useSyncExternalStore(
    (listener) => runtime.diagnostics.subscribe(listener),
    () => runtime.diagnostics.getSnapshot(),
  );
}
