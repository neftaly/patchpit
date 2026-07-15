import {
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  applyWorkspaceOperation,
  type WorkspaceOperation,
  type WorkspacePane,
  type WorkspacePaneId,
  type WorkspaceSplitEdge,
  type WorkspaceSplitIds,
  type WorkspaceState,
} from './workspace.ts';
import { allocateWorkspaceIds } from './workspace-ids.ts';

const tabDragType = 'application/x-patchpit-context';

export function WorkspaceView({ act, contextLabel, renderContext, resourceDragType, resourceUrl, workspace }: {
  readonly act: (operation: WorkspaceOperation) => void;
  readonly contextLabel: (contextId: string) => string;
  readonly renderContext: (contextId: string) => ReactNode;
  readonly resourceDragType: string;
  readonly resourceUrl: (resourceRef: string) => string | undefined;
  readonly workspace: WorkspaceState;
}) {
  const [drag, setDrag] = useState<DraggedContext>();
  const dropContext = (paneId: WorkspacePaneId, target: PaneDropTarget) => {
    if (drag === undefined) return;
    setDrag(undefined);
    act(operationForDrop(drag, paneId, target));
  };
  const renderLayout = (nodeId: string): ReactNode => {
    const node = workspace.nodes[nodeId];
    if (node === undefined) return null;
    return node.kind === 'pane'
      ? (
        <Pane
          key={nodeId}
          canDrop={(target) => drag !== undefined
            && applyWorkspaceOperation(workspace, operationForDrop(drag, nodeId, target)) !== workspace}
          shielded={drag !== undefined && drag.unshieldedPane !== nodeId}
          labelContext={contextLabel}
          onActivate={(contextId) => {
            act({ kind: 'workspace.context.activate', paneId: nodeId, contextId });
          }}
          onClose={(contextId) => {
            act({ kind: 'workspace.context.close', paneId: nodeId, contextId });
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
            act({ kind: 'workspace.split.resize', splitId: nodeId, ratio });
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
        const resourceId = event.dataTransfer.getData(resourceDragType);
        const url = resourceId === '' ? undefined : resourceUrl(resourceId);
        const allocated = allocateWorkspaceIds();
        const contextId = url === undefined
          ? event.dataTransfer.getData(tabDragType)
          : allocated.contextId;
        if (contextId !== '') {
          setDrag({
            contextId,
            nodes: allocated.nodes,
            open: resourceId !== '' && url !== undefined,
            unshieldedPane: resourceId === '' ? null : source?.dataset.pane ?? null,
            url,
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
  readonly nodes: WorkspaceSplitIds;
  readonly open: boolean;
  readonly unshieldedPane: string | null;
  readonly url: string | undefined;
};
type PaneDropTarget = { readonly beforeContext: string | undefined } | {
  readonly zone: ContentDropZone;
};

const operationForDrop = (
  drag: DraggedContext,
  paneId: WorkspacePaneId,
  target: PaneDropTarget,
): WorkspaceOperation => 'zone' in target && target.zone !== 'center'
  ? {
      kind: 'workspace.context.split',
      contextId: drag.contextId,
      targetPaneId: paneId,
      edge: target.zone,
      ids: drag.nodes,
      url: drag.url ?? null,
    }
  : {
      kind: 'workspace.context.move',
      contextId: drag.contextId,
      targetPaneId: paneId,
      beforeContext: 'beforeContext' in target ? target.beforeContext ?? null : null,
      url: drag.url ?? null,
      pin: drag.open,
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
