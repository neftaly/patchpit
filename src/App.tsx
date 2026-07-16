import { useMemo, useRef, useSyncExternalStore } from 'react';
import type { FsEntryRow } from '@patchpit/fs';
import {
  ContentView,
  resourceDragType,
} from './content/ContentView.tsx';
import {
  contentLabel,
  contentUrlForResource,
  resourceBrowserUrl,
} from './content/invocation.ts';
import {
  composeWorkspacePresentation,
  reconcileWorkspacePresence,
} from './workspace/presence.ts';
import {
  planOpenWorkspaceContext,
  planWorkspaceAction,
  type WorkspacePlan,
} from './workspace/controller.ts';
import { allocateWorkspaceIds } from './workspace/ids.ts';
import type { WorkspaceState } from './workspace/model.ts';
import { WorkspaceView } from './workspace/WorkspaceView.tsx';
import {
  projectResources,
  resourceByIdentity,
  resourcesFromSnapshot,
} from './content/resources.ts';
import type { PatchpitRuntime } from './root/runtime.ts';
import type { BrowserSandboxHost } from './browser/sandbox-host.ts';
import './app.css';

export function App({ runtime, sandboxHost }: {
  readonly runtime: PatchpitRuntime;
  readonly sandboxHost: BrowserSandboxHost;
}) {
  const resourceRuntime = runtime.resources;
  const workspaceRuntime = runtime.workspace;
  const workspacePresence = runtime.workspacePresence;
  const pending = useRef(Promise.resolve());
  const resourceSnapshot = useSyncExternalStore(
    (listener) => resourceRuntime.observer.subscribe(listener),
    () => resourceRuntime.observer.getSnapshot(),
    () => resourceRuntime.observer.getSnapshot(),
  );
  const resources = useMemo(
    () => projectResources(resourcesFromSnapshot(resourceSnapshot)),
    [resourceSnapshot],
  );
  const projection = useSyncExternalStore(
    workspaceRuntime.subscribe,
    workspaceRuntime.getSnapshot,
    workspaceRuntime.getSnapshot,
  );
  const presence = useSyncExternalStore(
    workspacePresence.subscribe,
    workspacePresence.getSnapshot,
    workspacePresence.getSnapshot,
  );
  if (projection.state !== 'ready') {
    return <main className="workspace"><p role="alert">Workspace unavailable.</p></main>;
  }
  const workspace = projection.workspace;
  const presentation = composeWorkspacePresentation(workspace, presence);
  const run = (plan: (
    workspace: WorkspaceState,
    presence: ReturnType<typeof workspacePresence.getSnapshot>,
  ) => WorkspacePlan) => {
    const queued = pending.current.then(async () => {
      const current = workspaceRuntime.getSnapshot();
      if (current.state !== 'ready') return;
      const planned = plan(current.workspace, workspacePresence.getSnapshot());
      for (const operation of planned.operations) await workspaceRuntime.act(operation);
      const latest = workspaceRuntime.getSnapshot();
      if (latest.state !== 'ready') return;
      workspacePresence.update(latest.workspace, () => reconcileWorkspacePresence(
        latest.workspace,
        planned.presence,
      ));
    });
    pending.current = queued.then(() => undefined, () => undefined);
  };
  const openResource = (resource: FsEntryRow, pinned: boolean) => {
    const url = contentUrlForResource(resource, resources);
    if (url === undefined) return;
    const allocated = allocateWorkspaceIds();
    run((currentWorkspace, currentPresence) => planOpenWorkspaceContext({
      contextId: allocated.contextId,
      isEditorContext,
      nodes: allocated.nodes,
      pinned,
      presence: currentPresence,
      url,
      workspace: currentWorkspace,
    }));
  };

  return (
    <WorkspaceView
      canDrop={(action) => {
        const planned = planWorkspaceAction({ action, isEditorContext, presence, workspace });
        return planned.operations.length > 0;
      }}
      act={(action) => {
        run((currentWorkspace, currentPresence) => planWorkspaceAction({
          action,
          isEditorContext,
          presence: currentPresence,
          workspace: currentWorkspace,
        }));
      }}
      contextLabel={(contextId) => contentLabel(resources, presentation.contexts[contextId]?.url)}
      renderContext={(contextId) => (
        <ContentView
          contentUrl={presentation.contexts[contextId]?.url}
          host={sandboxHost}
          onOpenResource={openResource}
          resources={resources}
          runtime={runtime}
        />
      )}
      resourceDragType={resourceDragType}
      resourceUrl={(resourceId) => {
        const resource = resourceByIdentity(resources, resourceId);
        return resource === undefined ? undefined : contentUrlForResource(resource, resources);
      }}
      workspace={presentation}
    />
  );
}

const isEditorContext = (url: string) => url !== resourceBrowserUrl;
