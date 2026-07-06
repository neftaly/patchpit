import { useSyncExternalStore } from 'react';
import type { BootstrapRuntimeClient } from '../runtime/bootstrap-runtime';
import { useRuntimeProjectionCatalog } from '../runtime/use-runtime-projection';
import {
  createStateBrowserSnapshot,
  StateBrowser,
  type StateBrowserSnapshotInput,
} from './StateBrowser';

type StateBrowserSurfaceProps = Omit<StateBrowserSnapshotInput, 'runtimeDiagnostics' | 'runtimeProjectionCatalog'> & {
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
  const runtimeProjectionCatalog = useRuntimeProjectionCatalog(runtime);

  return (
    <StateBrowser
      projectionCatalog={runtimeProjectionCatalog}
      runtime={runtime}
      snapshot={createStateBrowserSnapshot({
        filesystemProjection,
        runtimeAck,
        runtimeDiagnostics,
        runtimeIssue,
        runtimeIssueHistory,
        runtimePlatform,
        runtimeProjectionCatalog,
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
