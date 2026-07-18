import {
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { FolderLinkRow } from '@patchpit/fs';
import {
  ContentView,
  RESOURCE_DRAG_TYPE,
} from './content/ContentView.tsx';
import {
  contentLabel,
  contentUrlForResource,
  resourceBrowserUrl,
} from './content/invocation.ts';
import { useResourceTitles } from './content/use-resource-titles.ts';
import {
  composeWorkspacePresentation,
  reconcileWorkspaceViewState,
} from './workspace/view-state.ts';
import {
  planOpenWorkspaceContext,
  planWorkspaceAction,
  type WorkspacePlan,
} from './workspace/action-planner.ts';
import { allocateWorkspaceIds } from './workspace/ids.ts';
import type { WorkspaceState } from './workspace/durable-state.ts';
import { WorkspaceView } from './workspace/WorkspaceView.tsx';
import {
  projectResourceTree,
  resourceGraphStateFromQuerySnapshot,
  resourceRowsFromQuerySnapshot,
  resourceSourceProblemsFromQuerySnapshot,
} from './content/resource-projection.ts';
import type { PatchpitRuntime } from './root/runtime.ts';
import type { BrowserSandboxHost } from './browser/sandbox-host.ts';
import './app.css';

export function App({ runtime, sandboxHost }: {
  readonly runtime: PatchpitRuntime;
  readonly sandboxHost: BrowserSandboxHost;
}) {
  const resourceQuery = runtime.resourceQuery;
  const workspaceRuntime = runtime.workspaceRuntime;
  const workspacePresence = runtime.workspacePresence;
  const pendingWorkspacePlans = useRef(Promise.resolve());
  const subscribeResourceQuery = useCallback(
    (listener: () => void) => resourceQuery.subscribe(listener),
    [resourceQuery],
  );
  const getResourceSnapshot = useCallback(() => resourceQuery.getSnapshot(), [resourceQuery]);
  const resourceSnapshot = useSyncExternalStore(
    subscribeResourceQuery,
    getResourceSnapshot,
    getResourceSnapshot,
  );
  const resources = useMemo(
    () => projectResourceTree(
      resourceRowsFromQuerySnapshot(resourceSnapshot),
      runtime.rootUrl,
      {
        graphState: resourceGraphStateFromQuerySnapshot(resourceSnapshot),
        sourceProblems: resourceSourceProblemsFromQuerySnapshot(resourceSnapshot),
      },
    ),
    [resourceSnapshot, runtime.rootUrl],
  );
  const workspaceProjection = useSyncExternalStore(
    workspaceRuntime.subscribe,
    workspaceRuntime.getSnapshot,
    workspaceRuntime.getSnapshot,
  );
  const viewState = useSyncExternalStore(
    workspacePresence.subscribe,
    workspacePresence.getSnapshot,
    workspacePresence.getSnapshot,
  );
  const workspacePresentation = useMemo(() => workspaceProjection.state === 'ready'
    ? composeWorkspacePresentation(workspaceProjection.workspace, viewState, isEditorContext)
    : undefined, [viewState, workspaceProjection]);
  const resourceTitles = useResourceTitles(runtime, workspacePresentation === undefined
    ? []
    : Object.values(workspacePresentation.contexts).map(({ url }) => url));
  if (workspaceProjection.state !== 'ready' || workspacePresentation === undefined) {
    return <main className="workspace"><p role="alert">Workspace unavailable.</p></main>;
  }
  const workspace = workspaceProjection.workspace;
  const enqueueWorkspacePlan = (plan: (
    workspace: WorkspaceState,
    viewState: ReturnType<typeof workspacePresence.getSnapshot>,
  ) => WorkspacePlan) => {
    const queuedPlan = pendingWorkspacePlans.current.then(async () => {
      const currentProjection = workspaceRuntime.getSnapshot();
      if (currentProjection.state !== 'ready') return;
      const currentViewState = workspacePresence.getSnapshot();
      const workspacePlan = plan(currentProjection.workspace, currentViewState);
      if (workspacePlan.durableOperation === undefined && workspacePlan.viewState === currentViewState) return;
      if (workspacePlan.durableOperation !== undefined) {
        const receipt = await workspaceRuntime.commitOperation(workspacePlan.durableOperation);
        if (receipt.outcome === 'rejected' || receipt.outcome === 'unknown') return;
      }
      const committedProjection = workspaceRuntime.getSnapshot();
      if (committedProjection.state !== 'ready') return;
      await workspacePresence.update(committedProjection.workspace, () => reconcileWorkspaceViewState(
        committedProjection.workspace,
        workspacePlan.viewState,
      ));
    });
    pendingWorkspacePlans.current = queuedPlan.then(() => undefined, () => undefined);
  };
  const openResource = (resource: FolderLinkRow, pinned: boolean) => {
    const url = contentUrlForResource(resource, resources);
    if (url === undefined) return;
    const allocated = allocateWorkspaceIds();
    enqueueWorkspacePlan((currentWorkspace, currentViewState) => planOpenWorkspaceContext({
      contextId: allocated.contextId,
      isEditorContext,
      nodes: allocated.nodes,
      pinned,
      viewState: currentViewState,
      url,
      workspace: currentWorkspace,
    }));
  };

  return (
    <WorkspaceView
      canApplyDrop={(action) => {
        const planned = planWorkspaceAction({ action, viewState, workspace });
        return planned.durableOperation !== undefined;
      }}
      dispatchAction={(action) => {
        enqueueWorkspacePlan((currentWorkspace, currentViewState) => planWorkspaceAction({
          action,
          viewState: currentViewState,
          workspace: currentWorkspace,
        }));
      }}
      getContextLabel={(contextId) => contentLabel(
        resources,
        workspacePresentation.contexts[contextId]?.url,
        resourceTitles,
      )}
      getResourceUrl={(resourceId) => {
        const resource = resources.byIdentity.get(resourceId);
        return resource === undefined ? undefined : contentUrlForResource(resource, resources);
      }}
      renderContextContent={(contextId, onInteract) => (
        <ContentView
          contentUrl={workspacePresentation.contexts[contextId]?.url}
          onInteract={onInteract}
          onOpenResource={openResource}
          resources={resources}
          resourceTitles={resourceTitles}
          sandboxHost={sandboxHost}
          contentRuntime={runtime}
        />
      )}
      resourceDragType={RESOURCE_DRAG_TYPE}
      workspacePresentation={workspacePresentation}
    />
  );
}

const isEditorContext = (url: string) => url !== resourceBrowserUrl;
