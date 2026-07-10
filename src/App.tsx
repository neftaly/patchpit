import { useState, useSyncExternalStore, type DragEvent, type ReactNode } from 'react';
import { sandboxCompatApp } from '../apps/sandbox-compat/app.ts';
import { createSandboxFrameAttributes } from '@patchpit/sandbox';
import {
  openResources,
  resourceById,
  resourceContent,
  resourceGroups,
  resourceId,
  resourcesFromSnapshot,
  type Resource,
} from './resources.ts';
import {
  activateContext,
  createWorkspace,
  moveContext,
  openContext,
  previewContext,
  type WorkspacePaneId,
  type WorkspaceState,
} from './workspace.ts';
import './app.css';

const paneIds = ['left', 'right'] as const;
const resourceListContextId = 'resources';
const sandboxCompatEntryId = sandboxCompatApp.entry.join('/');
const tabDragType = 'application/x-patchpit-context';
const resourceRuntime = openResources();

export function App() {
  const resourceSnapshot = useSyncExternalStore(
    (listener) => resourceRuntime.observer.subscribe(listener),
    () => resourceRuntime.observer.getSnapshot(),
    () => resourceRuntime.observer.getSnapshot(),
  );
  const resources = resourcesFromSnapshot(resourceSnapshot);
  const [workspace, setWorkspace] = useState(() => createWorkspace(resourceListContextId));
  const showResource = (resource: Resource, pinned: boolean) => {
    if (resource.kind !== 'file') return;
    const contextId = resourceId(resource);
    setWorkspace((current) => (pinned ? openContext : previewContext)(current, contextId, 'right'));
  };

  const renderContext = (contextId: string): ReactNode => {
    if (contextId === resourceListContextId) {
      return <Resources onShow={showResource} resources={resources} />;
    }
    const resource = resourceById(resources, contextId);
    if (resource === undefined) return null;
    return resource.sourceId === sandboxCompatApp.id && resource.localId === sandboxCompatEntryId
      ? <SandboxApp />
      : <Viewer resource={resource} />;
  };

  return (
    <main className="workspace">
      {paneIds.map((paneId) => (
        <Pane
          labelContext={(contextId) => contextLabel(resources, contextId)}
          key={paneId}
          onActivate={(contextId) => setWorkspace((current) => activateContext(current, paneId, contextId))}
          onMove={(contextId, beforeContext) =>
            setWorkspace((current) => moveContext(current, contextId, paneId, beforeContext))}
          paneId={paneId}
          renderContext={renderContext}
          workspace={workspace}
        />
      ))}
    </main>
  );
}

function Pane({ labelContext, onActivate, onMove, paneId, renderContext, workspace }: {
  readonly labelContext: (contextId: string) => string;
  readonly onActivate: (contextId: string) => void;
  readonly onMove: (contextId: string, beforeContext?: string) => void;
  readonly paneId: WorkspacePaneId;
  readonly renderContext: (contextId: string) => ReactNode;
  readonly workspace: WorkspaceState;
}) {
  const [dragOver, setDragOver] = useState(false);
  const pane = workspace[paneId];
  const acceptDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes(tabDragType)) return;
    event.preventDefault();
    setDragOver(true);
  };
  const drop = (event: DragEvent<HTMLElement>, beforeContext?: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    onMove(event.dataTransfer.getData(tabDragType), beforeContext);
  };

  return (
    <section
      className="pane"
      data-drag-over={dragOver || undefined}
      data-pane={paneId}
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !event.currentTarget.contains(related)) setDragOver(false);
      }}
      onDragOver={acceptDrop}
      onDrop={drop}
    >
      <div className="tabs">
        {pane.contexts.map((contextId) => {
          return (
            <button
              className="tab"
              data-active={pane.activeContext === contextId || undefined}
              data-context={contextId}
              data-preview={pane.previewContext === contextId || undefined}
              draggable
              key={contextId}
              onClick={() => onActivate(contextId)}
              onDragOver={acceptDrop}
              onDragStart={(event) => event.dataTransfer.setData(tabDragType, contextId)}
              onDrop={(event) => drop(event, contextId)}
              type="button"
            >
              {labelContext(contextId)}
            </button>
          );
        })}
      </div>
      <div className="pane-content">
        {pane.contexts.map((contextId) => (
          <div className="app" hidden={pane.activeContext !== contextId} key={contextId}>
            {renderContext(contextId)}
          </div>
        ))}
      </div>
    </section>
  );
}

function Resources({ onShow, resources }: {
  readonly onShow: (resource: Resource, pinned: boolean) => void;
  readonly resources: readonly Resource[];
}) {
  return (
    <section className="view">
      {resourceGroups(resources).map((group) => (
        <div className="resource-group" key={group.sourceId}>
          <div className="resource-source">{group.sourceId}</div>
          {group.rows.map(({ depth, resource }) => resource.kind === 'folder'
            ? (
                <div
                  className="resource resource-folder"
                  key={resource.localId}
                  style={{ paddingLeft: 8 + (depth * 18) }}
                >
                  {resource.name}
                </div>
              )
            : (
                <button
                  className="resource"
                  key={resource.localId}
                  onClick={() => onShow(resource, false)}
                  onDoubleClick={() => onShow(resource, true)}
                  style={{ paddingLeft: 8 + (depth * 18) }}
                  type="button"
                >
                  {resource.name}
                </button>
              ))}
        </div>
      ))}
    </section>
  );
}

function Viewer({ resource }: {
  readonly resource: Resource;
}) {
  return <pre className="viewer">{resourceContent(resource)}</pre>;
}

function SandboxApp() {
  const frame = createSandboxFrameAttributes({
    baseUrl: window.location.href,
    entry: sandboxCompatApp.entry,
    mountId: sandboxCompatApp.id,
  });
  return <iframe className="sandbox-app" title="Sandbox Compat" {...frame} />;
}

const contextLabel = (resources: readonly Resource[], contextId: string) => {
  const resource = resourceById(resources, contextId);
  return resource === undefined ? 'Resources' : `${resource.sourceId} / ${resource.name}`;
};
