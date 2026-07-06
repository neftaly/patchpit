import { useSyncExternalStore } from 'react';
import type { BootstrapRuntimeClient } from '../runtime/bootstrap-runtime';
import {
  createStateBrowserSnapshot,
  StateBrowser,
  type StateBrowserSnapshotInput,
} from './StateBrowser';

type StateBrowserSurfaceProps = Omit<StateBrowserSnapshotInput, 'runtimeDiagnostics'> & {
  readonly runtime: BootstrapRuntimeClient;
};

export function StateBrowserSurface({
  filesystemProjection,
  runtime,
  runtimeAck,
  runtimeIssue,
  runtimeIssueHistory,
  runtimePlatform,
  runtimeState,
  workspaceProjection,
}: StateBrowserSurfaceProps) {
  const runtimeDiagnostics = useRuntimeDiagnostics(runtime);

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
        workspaceProjection,
      })}
    />
  );
}

function useRuntimeDiagnostics(runtime: BootstrapRuntimeClient) {
  return useSyncExternalStore(
    (listener) => runtime.diagnostics.subscribe(listener),
    () => runtime.diagnostics.getSnapshot(),
  );
}
