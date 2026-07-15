import { useSyncExternalStore } from 'react';
import {
  ContentView,
  contentLabel,
  contentUrlForResource,
  resourceBrowserUrl,
  resourceDragType,
} from './content.tsx';
import {
  contextIdForUrl, paneIdsInLayoutOrder,
  type WorkspaceState,
} from './workspace.ts';
import { allocateWorkspaceIds } from './workspace-ids.ts';
import { WorkspaceView } from './workspace-view.tsx';
import {
  resourceById,
  resourcesFromSnapshot,
  type Resource,
} from './resources.ts';
import type { PatchpitRuntime } from './patchpit-runtime.ts';
import type { BrowserSandboxHost } from './browser-sandbox-host.ts';
import './app.css';

export function App({ runtime, sandboxHost }: {
  readonly runtime: PatchpitRuntime;
  readonly sandboxHost: BrowserSandboxHost;
}) {
  const resourceRuntime = runtime.resources;
  const workspaceRuntime = runtime.workspace;
  const resourceSnapshot = useSyncExternalStore(
    (listener) => resourceRuntime.observer.subscribe(listener),
    () => resourceRuntime.observer.getSnapshot(),
    () => resourceRuntime.observer.getSnapshot(),
  );
  const resources = resourcesFromSnapshot(resourceSnapshot);
  const projection = useSyncExternalStore(
    workspaceRuntime.subscribe,
    workspaceRuntime.getSnapshot,
    workspaceRuntime.getSnapshot,
  );
  if (projection.state !== 'ready') {
    return <main className="workspace"><p role="alert">Workspace unavailable.</p></main>;
  }
  const workspace = projection.workspace;
  const openResource = (resource: Resource, pinned: boolean) => {
    const url = contentUrlForResource(resource, resources);
    if (url === undefined) return;
    const allocated = allocateWorkspaceIds();
    const paneId = documentPaneId(workspace) ?? allocated.nodes.paneId;
    const contextId = contextIdForUrl(workspace, url, paneId) ?? allocated.contextId;
    void workspaceRuntime.act({
      kind: 'workspace.context.open',
      contextId,
      url,
      targetPaneId: paneId,
      missingSplitId: allocated.nodes.splitId,
      mode: pinned ? 'open' : 'preview',
    });
  };

  return (
    <WorkspaceView
      act={(operation) => { void workspaceRuntime.act(operation); }}
      contextLabel={(contextId) => contentLabel(resources, workspace.contexts[contextId]?.url)}
      renderContext={(contextId) => (
        <ContentView
          contentUrl={workspace.contexts[contextId]?.url}
          host={sandboxHost}
          onOpenResource={openResource}
          resources={resources}
          runtime={runtime}
        />
      )}
      resourceDragType={resourceDragType}
      resourceUrl={(resourceId) => {
        const resource = resourceById(resources, resourceId);
        return resource === undefined ? undefined : contentUrlForResource(resource, resources);
      }}
      workspace={workspace}
    />
  );
}

const documentPaneId = (workspace: WorkspaceState) => paneIdsInLayoutOrder(workspace)
  .find((paneId) => {
    const node = workspace.nodes[paneId];
    return node?.kind === 'pane'
      && node.contexts.some((contextId) => workspace.contexts[contextId]?.url !== resourceBrowserUrl);
  });
