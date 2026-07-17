import {
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
  const workspaceViewStateRuntime = runtime.workspaceViewStateRuntime;
  const pendingWorkspacePlans = useRef(Promise.resolve());
  const resourceSnapshot = useSyncExternalStore(
    (listener) => resourceQuery.subscribe(listener),
    () => resourceQuery.getSnapshot(),
    () => resourceQuery.getSnapshot(),
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
    workspaceViewStateRuntime.subscribe,
    workspaceViewStateRuntime.getSnapshot,
    workspaceViewStateRuntime.getSnapshot,
  );
  const workspacePresentation = useMemo(() => workspaceProjection.state === 'ready'
    ? composeWorkspacePresentation(workspaceProjection.workspace, viewState)
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
    viewState: ReturnType<typeof workspaceViewStateRuntime.getSnapshot>,
  ) => WorkspacePlan) => {
    const queuedPlan = pendingWorkspacePlans.current.then(async () => {
      const currentProjection = workspaceRuntime.getSnapshot();
      if (currentProjection.state !== 'ready') return;
      const workspacePlan = plan(currentProjection.workspace, workspaceViewStateRuntime.getSnapshot());
      for (const operation of workspacePlan.operations) await workspaceRuntime.commitOperation(operation);
      const committedProjection = workspaceRuntime.getSnapshot();
      if (committedProjection.state !== 'ready') return;
      workspaceViewStateRuntime.update(committedProjection.workspace, () => reconcileWorkspaceViewState(
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
        const planned = planWorkspaceAction({ action, isEditorContext, viewState, workspace });
        return planned.operations.length > 0;
      }}
      dispatchAction={(action) => {
        enqueueWorkspacePlan((currentWorkspace, currentViewState) => planWorkspaceAction({
          action,
          isEditorContext,
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
      renderContextContent={(contextId) => (
        <ContentView
          contentUrl={workspacePresentation.contexts[contextId]?.url}
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
