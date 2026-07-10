import { useState, type DragEvent, type ReactNode } from 'react';
import {
  resourceById,
  resourceId,
  resources,
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
const tabDragType = 'application/x-patchpit-context';

export function App() {
  const [workspace, setWorkspace] = useState(() => createWorkspace(resourceListContextId));
  const showResource = (resource: Resource, pinned: boolean) => {
    const contextId = resourceId(resource);
    setWorkspace((current) => (pinned ? openContext : previewContext)(current, contextId, 'right'));
  };

  const renderContext = (contextId: string): ReactNode => {
    if (contextId === resourceListContextId) {
      return <Resources onShow={showResource} />;
    }
    const resource = resourceById(contextId);
    return resource === undefined ? null : <Viewer resource={resource} />;
  };

  return (
    <main className="workspace">
      {paneIds.map((paneId) => (
        <Pane
          labelContext={contextLabel}
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

function Resources({ onShow }: {
  readonly onShow: (resource: Resource, pinned: boolean) => void;
}) {
  return (
    <section className="view">
      {resources.map((resource) => (
        <button
          className="resource"
          key={`${resource.sourceId}:${resource.localId}`}
          onClick={() => onShow(resource, false)}
          onDoubleClick={() => onShow(resource, true)}
          type="button"
        >
          {resource.sourceId} / {resource.name}
        </button>
      ))}
    </section>
  );
}

function Viewer({ resource }: {
  readonly resource: Resource;
}) {
  return <pre className="viewer">{resource.content}</pre>;
}

const contextLabel = (contextId: string) => {
  const resource = resourceById(contextId);
  return resource === undefined ? 'Resources' : `${resource.sourceId} / ${resource.name}`;
};
