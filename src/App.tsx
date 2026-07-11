import {
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
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
  closeContext,
  moveContext,
  openContext,
  previewContext,
  resizeSplit,
  splitContext,
  type WorkspacePaneId,
  type WorkspacePane,
  type WorkspaceSplitEdge,
  type WorkspaceState,
} from './workspace.ts';
import { openWorkspace } from './workspace-runtime.ts';
import './app.css';

const resourceListContextId = 'resources';
const sandboxCompatEntryId = sandboxCompatApp.entry.join('/');
const tabDragType = 'application/x-patchpit-context';
const resourceDragType = 'application/x-patchpit-resource';
const sandboxCompatContextId = resourceId(sandboxCompatApp.id, sandboxCompatEntryId);
const workspaceRuntime = openWorkspace(resourceListContextId, sandboxCompatContextId);
const resourceRuntime = openResources([workspaceRuntime.attachment]);

export function App() {
  const resourceSnapshot = useSyncExternalStore(
    (listener) => resourceRuntime.observer.subscribe(listener),
    () => resourceRuntime.observer.getSnapshot(),
    () => resourceRuntime.observer.getSnapshot(),
  );
  const resources = resourcesFromSnapshot(resourceSnapshot);
  const { workspace } = useSyncExternalStore(
    workspaceRuntime.subscribe,
    workspaceRuntime.getSnapshot,
    workspaceRuntime.getSnapshot,
  );
  const workspaceContent = JSON.stringify(workspace, null, 2);
  const [drag, setDrag] = useState<DraggedContext>();
  const showResource = (resource: Resource, pinned: boolean) => {
    if (resource.kind !== 'file') return;
    const contextId = resourceId(resource.sourceId, resource.localId);
    void workspaceRuntime.update((current) => (
      pinned ? openContext : previewContext
    )(current, contextId, documentPaneId(current)));
  };

  const renderContext = (contextId: string): ReactNode => {
    if (contextId === resourceListContextId) {
      return <Resources onShow={showResource} resources={resources} />;
    }
    const resource = resourceById(resources, contextId);
    if (resource === undefined) return null;
    return resource.sourceId === sandboxCompatApp.id && resource.localId === sandboxCompatEntryId
      ? <SandboxApp />
      : <Viewer content={resource.resourceRef === workspaceRuntime.resourceRef
        ? workspaceContent
        : resourceContent(resource)} />;
  };
  const dropContext = (paneId: WorkspacePaneId, target: PaneDropTarget) => {
    if (drag === undefined) return;
    setDrag(undefined);
    void workspaceRuntime.update((current) => applyDrop(current, drag, paneId, target));
  };
  const renderLayout = (nodeId: string): ReactNode => {
    const node = workspace.nodes[nodeId];
    if (node === undefined) return null;
    return node.kind === 'pane'
      ? (
        <Pane
          key={nodeId}
          canDrop={(target) => drag !== undefined && applyDrop(workspace, drag, nodeId, target) !== workspace}
          shielded={drag !== undefined && drag.unshieldedPane !== nodeId}
          labelContext={(contextId) => contextLabel(resources, contextId)}
          onActivate={(contextId) => {
            void workspaceRuntime.update((current) => activateContext(current, nodeId, contextId));
          }}
          onClose={(contextId) => {
            void workspaceRuntime.update((current) => closeContext(current, nodeId, contextId));
          }}
          onDrop={(target) => dropContext(nodeId, target)}
          pane={node}
          paneId={nodeId}
          renderContext={renderContext}
          root={workspace.rootNodeId === nodeId}
        />
      )
      : (
        <Split
          axis={node.axis}
          first={renderLayout(node.first)}
          nodeId={nodeId}
          onResize={(ratio) => {
            void workspaceRuntime.update((current) => resizeSplit(current, nodeId, ratio));
          }}
          ratio={node.ratio}
          second={renderLayout(node.second)}
        />
      );
  };

  return (
    <main
      className="workspace"
      onDragEnd={() => setDrag(undefined)}
      onDragStart={(event) => {
        const source = event.target instanceof Element ? event.target.closest<HTMLElement>('.pane') : null;
        const resourceContext = event.dataTransfer.getData(resourceDragType);
        const contextId = resourceContext || event.dataTransfer.getData(tabDragType);
        if (contextId !== '') {
          setDrag({
            contextId,
            open: resourceContext !== '',
            unshieldedPane: resourceContext === '' ? null : source?.dataset.pane ?? null,
          });
        }
      }}
    >
      {renderLayout(workspace.rootNodeId)}
    </main>
  );
}

type ContentDropZone = WorkspaceSplitEdge | 'center';
type DraggedContext = {
  readonly contextId: string;
  readonly open: boolean;
  readonly unshieldedPane: string | null;
};
type PaneDropTarget = { readonly beforeContext: string | undefined } | {
  readonly zone: ContentDropZone;
};

const applyDrop = (
  workspace: WorkspaceState,
  drag: DraggedContext,
  paneId: WorkspacePaneId,
  target: PaneDropTarget,
) => {
  if ('zone' in target && target.zone !== 'center') {
    return splitContext(workspace, drag.contextId, paneId, target.zone);
  }
  const opened = drag.open ? openContext(workspace, drag.contextId, paneId) : workspace;
  return moveContext(opened, drag.contextId, paneId, 'beforeContext' in target ? target.beforeContext : undefined);
};

function Split({ axis, first, nodeId, onResize, ratio, second }: {
  readonly axis: 'horizontal' | 'vertical';
  readonly first: ReactNode;
  readonly nodeId: string;
  readonly onResize: (ratio: number) => void;
  readonly ratio: number;
  readonly second: ReactNode;
}) {
  const split = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | undefined>(undefined);
  const [draftRatio, setDraftRatio] = useState<number>();
  const displayedRatio = draftRatio ?? ratio;
  const ratioAtPointer = (event: PointerEvent<HTMLElement>) => {
    const bounds = split.current?.getBoundingClientRect();
    if (bounds === undefined) return ratio;
    const position = axis === 'horizontal'
      ? (event.clientX - bounds.left) / bounds.width
      : (event.clientY - bounds.top) / bounds.height;
    return Math.min(0.9, Math.max(0.1, position));
  };
  const finishResize = (event: PointerEvent<HTMLElement>) => {
    if (activePointer.current !== event.pointerId) return;
    const nextRatio = ratioAtPointer(event);
    activePointer.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraftRatio(undefined);
    onResize(nextRatio);
  };

  return (
    <div className="split" data-axis={axis} data-node={nodeId} data-ratio={displayedRatio} ref={split}>
      <div className="split-child" style={{ flexGrow: displayedRatio }}>{first}</div>
      <div
        className="resize-handle"
        onPointerCancel={(event) => {
          if (activePointer.current !== event.pointerId) return;
          activePointer.current = undefined;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDraftRatio(undefined);
        }}
        onPointerDown={(event) => {
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDraftRatio(ratioAtPointer(event));
        }}
        onPointerMove={(event) => {
          if (activePointer.current === event.pointerId) setDraftRatio(ratioAtPointer(event));
        }}
        onPointerUp={finishResize}
      />
      <div className="split-child" style={{ flexGrow: 1 - displayedRatio }}>{second}</div>
    </div>
  );
}

function Pane({ canDrop, labelContext, onActivate, onClose, onDrop, pane, paneId, renderContext, root, shielded }: {
  readonly canDrop: (target: PaneDropTarget) => boolean;
  readonly labelContext: (contextId: string) => string;
  readonly onActivate: (contextId: string) => void;
  readonly onClose: (contextId: string) => void;
  readonly onDrop: (target: PaneDropTarget) => void;
  readonly pane: WorkspacePane;
  readonly paneId: WorkspacePaneId;
  readonly renderContext: (contextId: string) => ReactNode;
  readonly root: boolean;
  readonly shielded: boolean;
}) {
  const [dropTarget, setDropTarget] = useState<number | ContentDropZone>();
  const previewDrop = (preview: number | ContentDropZone, target: PaneDropTarget) => {
    setDropTarget(canDrop(target) ? preview : undefined);
  };
  const tabTarget = (event: DragEvent<HTMLElement>, index: number) => {
    const dropIndex = tabDropIndex(event, index);
    const target = { beforeContext: pane.contexts[dropIndex] };
    if (canDrop(target)) return { dropIndex, target };
    const alternateIndex = dropIndex === index ? index + 1 : index;
    return { dropIndex: alternateIndex, target: { beforeContext: pane.contexts[alternateIndex] } };
  };
  const drop = (
    event: DragEvent<HTMLElement>,
    target: PaneDropTarget = { beforeContext: undefined },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(undefined);
    onDrop(target);
  };

  return (
    <section
      className="pane"
      data-pane={paneId}
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !event.currentTarget.contains(related)) setDropTarget(undefined);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        previewDrop(pane.contexts.length, { beforeContext: undefined });
      }}
      onDrop={drop}
    >
      <div className="tabs">
        {pane.contexts.map((contextId, index) => {
          const label = labelContext(contextId);
          return (
            <div
              className="tab"
              data-active={pane.activeContext === contextId || undefined}
              data-context={contextId}
              data-drop-target={dropTarget === index
                ? 'before'
                : dropTarget === pane.contexts.length && index === pane.contexts.length - 1
                  ? 'after'
                  : undefined}
              data-preview={pane.previewContext === contextId || undefined}
              key={contextId}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const { dropIndex, target } = tabTarget(event, index);
                previewDrop(dropIndex, target);
              }}
              onDragStart={(event) => event.dataTransfer.setData(tabDragType, contextId)}
              onDrop={(event) => drop(event, tabTarget(event, index).target)}
            >
              <button className="tab-label" draggable onClick={() => onActivate(contextId)} type="button">
                {label}
              </button>
              {(pane.contexts.length > 1 || !root) && (
                <button
                  aria-label={`Close ${label}`}
                  className="tab-close"
                  draggable={false}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(contextId);
                  }}
                  title="Close"
                  type="button"
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        className="pane-content"
        data-drop-zone={typeof dropTarget === 'string' ? dropTarget : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const zone = contentDropZone(event);
          previewDrop(zone, { zone });
        }}
        onDrop={(event) => drop(event, { zone: contentDropZone(event) })}
      >
        {shielded && <div className="drag-shield" />}
        {pane.contexts.map((contextId) => (
          <div className="app" hidden={pane.activeContext !== contextId} key={contextId}>
            {renderContext(contextId)}
          </div>
        ))}
      </div>
    </section>
  );
}

const tabDropIndex = (event: DragEvent<HTMLElement>, index: number) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientX < bounds.left + (bounds.width / 2) ? index : index + 1;
};

const contentDropZone = (event: DragEvent<HTMLElement>): ContentDropZone => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  const edges: readonly [WorkspaceSplitEdge, number][] = [
    ['left', x],
    ['right', 1 - x],
    ['top', y],
    ['bottom', 1 - y],
  ];
  const [edge, distance] = edges.reduce((closest, candidate) => (
    candidate[1] < closest[1] ? candidate : closest
  ));
  return distance < 1 / 3 ? edge : 'center';
};

function Resources({ onShow, resources }: {
  readonly onShow: (resource: Resource, pinned: boolean) => void;
  readonly resources: readonly Resource[];
}) {
  return (
    <section className="view">
      {resourceGroups(resources).map((group) => (
        <div className="resource-group" key={group.sourceId}>
          <div className="resource resource-folder resource-source" style={treeDepthStyle(0)}>
            <span aria-hidden="true" className="resource-icon">📂</span>
            <span className="resource-name">{group.sourceId}</span>
          </div>
          {group.rows.map(({ depth, resource }) => {
            const label = (
              <>
                <span aria-hidden="true" className="resource-icon">{resourceIcon(resource)}</span>
                <span className="resource-name">{resource.name}</span>
              </>
            );
            return resource.kind === 'folder'
              ? (
                  <div
                    className="resource resource-folder"
                    key={resource.localId}
                    style={treeDepthStyle(depth + 1)}
                  >
                    {label}
                  </div>
                )
              : (
                  <button
                    className="resource"
                    draggable
                    key={resource.localId}
                    onClick={() => onShow(resource, false)}
                    onDoubleClick={() => onShow(resource, true)}
                    onDragStart={(event) => event.dataTransfer.setData(resourceDragType, resourceId(resource.sourceId, resource.localId))}
                    style={treeDepthStyle(depth + 1)}
                    type="button"
                  >
                    {label}
                  </button>
                );
          })}
        </div>
      ))}
    </section>
  );
}

const treeDepthStyle = (depth: number) => ({ '--tree-depth-size': `${depth}rem` }) as CSSProperties;

const resourceIcon = (resource: Resource) => {
  if (resource.kind === 'folder') return '📂';
  const extension = resource.name.split('.').at(-1)?.toLowerCase();
  if (extension === 'am') return '🔀';
  if (extension === 'json' || extension === 'ndjson') return '🧾';
  if (extension === 'js' || extension === 'mjs' || extension === 'ts') return '📜';
  if (extension === 'css') return '💅';
  if (extension === 'html' || extension === 'htm') return '🌐';
  if (extension === 'md' || extension === 'txt') return '📝';
  if (extension === 'gltf' || extension === 'glb' || extension === 'obj') return '🧊';
  if (extension === 'svg' || extension === 'png' || extension === 'jpg' || extension === 'webp') return '🖼️';
  return '📄';
};

function Viewer({ content }: {
  readonly content: unknown;
}) {
  return <pre className="viewer">{String(content)}</pre>;
}

function SandboxApp() {
  const baseRoute = import.meta.env.BASE_URL.split('/').filter((segment) => segment !== '');
  const frame = createSandboxFrameAttributes({
    baseUrl: window.location.href,
    entry: sandboxCompatApp.entry,
    mountId: sandboxCompatApp.id,
    route: [...baseRoute, '__patchpit', 'sandbox'],
  });
  return <iframe className="sandbox-app" title="Sandbox Compat" {...frame} />;
}

const contextLabel = (resources: readonly Resource[], contextId: string) => {
  const resource = resourceById(resources, contextId);
  return resource === undefined ? 'Resources' : `${resource.sourceId} / ${resource.name}`;
};

const documentPaneId = (workspace: WorkspaceState) => Object.entries(workspace.nodes)
  .find(([, node]) => node.kind === 'pane'
    && node.contexts.some((contextId) => contextId !== resourceListContextId))?.[0]
  ?? 'right';
