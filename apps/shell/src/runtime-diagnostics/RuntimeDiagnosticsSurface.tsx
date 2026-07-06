import { useSyncExternalStore } from 'react';
import type { BootstrapRuntimeClient } from '../runtime/bootstrap-runtime';
import {
  createRuntimeDiagnosticsSnapshot,
  RuntimeDiagnostics,
  type RuntimeDiagnosticsSnapshotInput,
} from './RuntimeDiagnostics';

type RuntimeDiagnosticsSurfaceProps = Omit<RuntimeDiagnosticsSnapshotInput, 'runtimeDiagnostics' | 'runtimeResources'> & {
  readonly runtime: BootstrapRuntimeClient;
};

export function RuntimeDiagnosticsSurface({
  runtime,
  runtimeAck,
  runtimeIssue,
  runtimeIssueHistory,
  runtimePlatform,
}: RuntimeDiagnosticsSurfaceProps) {
  const runtimeDiagnostics = useRuntimeDiagnostics(runtime);

  return (
    <RuntimeDiagnostics
      snapshot={createRuntimeDiagnosticsSnapshot({
        runtimeAck,
        runtimeDiagnostics,
        runtimeResources: {
          documentUrls: runtime.resources.documentUrls,
          rootUrl: runtime.resources.rootUrl,
        },
        runtimeIssue,
        runtimeIssueHistory,
        runtimePlatform,
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
