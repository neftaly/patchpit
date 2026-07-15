import {
  useRef,
  useState,
  type CSSProperties,
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
  const [draftRatios, setDraftRatios] = useState<Readonly<Record<string, number>>>({});
  const layout = projectWorkspaceLayout(workspace, draftRatios);
  const operationForCurrentDrop = (paneId: WorkspacePaneId, target: PaneDropTarget) =>
    drag === undefined || (drag.resource && drag.sourcePaneId === paneId)
      ? undefined
      : operationForDrop(drag, paneId, target);
  const dropContext = (paneId: WorkspacePaneId, target: PaneDropTarget) => {
    const operation = operationForCurrentDrop(paneId, target);
    setDrag(undefined);
    if (operation !== undefined) act(operation);
  };
  const setDraftRatio = (splitId: string, ratio: number | undefined) => {
    setDraftRatios((current) => {
      if (ratio === undefined) {
        if (current[splitId] === undefined) return current;
        const next = { ...current };
        delete next[splitId];
        return next;
      }
      return current[splitId] === ratio ? current : { ...current, [splitId]: ratio };
    });
  };

  return (
    <main
      className="workspace"
      onDragEnd={() => setDrag(undefined)}
      onDragStart={(event) => {
        const source = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-pane], [data-context-pane]')
          : null;
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
            resource: resourceId !== '',
            sourcePaneId: resourceId === ''
              ? null
              : source?.dataset.pane ?? source?.dataset.contextPane ?? null,
            url,
          });
        }
      }}
    >
      {layout.panes.map(({ pane, paneId, rect }) => (
        <Pane
          key={paneId}
          canDrop={(target) => {
            const operation = operationForCurrentDrop(paneId, target);
            return operation !== undefined && applyWorkspaceOperation(workspace, operation) !== workspace;
          }}
          dragging={drag !== undefined}
          labelContext={contextLabel}
          onActivate={(contextId) => {
            act({ kind: 'workspace.context.activate', paneId, contextId });
          }}
          onClose={(contextId) => {
            act({ kind: 'workspace.context.close', paneId, contextId });
          }}
          onDrop={(target) => dropContext(paneId, target)}
          pane={pane}
          paneId={paneId}
          rect={rect}
          root={workspace.rootNodeId === paneId}
        />
      ))}
      <div className="context-layer">
        {layout.contexts.map(({ active, contextId, paneId, rect }) => (
          <div
            className="app"
            data-context-host={contextId}
            data-context-pane={paneId}
            hidden={!active}
            key={contextId}
            style={rectStyle(rect)}
          >
            {renderContext(contextId)}
          </div>
        ))}
      </div>
      {layout.splits.map(({ axis, ratio, rect, splitId }) => (
        <SplitBoundary
          axis={axis}
          key={splitId}
          nodeId={splitId}
          onDraftRatio={(nextRatio) => setDraftRatio(splitId, nextRatio)}
          onResize={(ratio) => {
            act({ kind: 'workspace.split.resize', splitId, ratio });
          }}
          ratio={ratio}
          rect={rect}
        />
      ))}
    </main>
  );
}

type ContentDropZone = WorkspaceSplitEdge | 'center';
type DraggedContext = {
  readonly contextId: string;
  readonly nodes: WorkspaceSplitIds;
  readonly open: boolean;
  readonly resource: boolean;
  readonly sourcePaneId: string | null;
  readonly url: string | undefined;
};
type PaneDropTarget = { readonly beforeContext: string | undefined } | {
  readonly zone: ContentDropZone;
};

type LayoutRect = {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
};

const projectWorkspaceLayout = (
  workspace: WorkspaceState,
  draftRatios: Readonly<Record<string, number>>,
) => {
  const panes: Array<{ pane: WorkspacePane; paneId: WorkspacePaneId; rect: LayoutRect }> = [];
  const splits: Array<{
    axis: 'horizontal' | 'vertical';
    ratio: number;
    rect: LayoutRect;
    splitId: string;
  }> = [];
  const visited = new Set<string>();
  const visit = (nodeId: string, rect: LayoutRect) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = workspace.nodes[nodeId];
    if (node?.kind === 'pane') {
      panes.push({ pane: node, paneId: nodeId, rect });
      return;
    }
    if (node?.kind !== 'split') return;
    const ratio = draftRatios[nodeId] ?? node.ratio;
    splits.push({ axis: node.axis, ratio, rect, splitId: nodeId });
    if (node.axis === 'horizontal') {
      visit(node.first, { ...rect, width: rect.width * ratio });
      visit(node.second, {
        ...rect,
        left: rect.left + (rect.width * ratio),
        width: rect.width * (1 - ratio),
      });
      return;
    }
    visit(node.first, { ...rect, height: rect.height * ratio });
    visit(node.second, {
      ...rect,
      height: rect.height * (1 - ratio),
      top: rect.top + (rect.height * ratio),
    });
  };
  visit(workspace.rootNodeId, { height: 1, left: 0, top: 0, width: 1 });
  const contexts = panes.flatMap(({ pane, paneId, rect }) => pane.contexts.map((contextId) => ({
    active: pane.activeContext === contextId,
    contextId,
    paneId,
    rect,
  })));
  return { contexts, panes, splits };
};

const rectStyle = (rect: LayoutRect): CSSProperties => ({
  height: `${rect.height * 100}%`,
  left: `${rect.left * 100}%`,
  top: `${rect.top * 100}%`,
  width: `${rect.width * 100}%`,
});

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

function SplitBoundary({ axis, nodeId, onDraftRatio, onResize, ratio, rect }: {
  readonly axis: 'horizontal' | 'vertical';
  readonly nodeId: string;
  readonly onDraftRatio: (ratio: number | undefined) => void;
  readonly onResize: (ratio: number) => void;
  readonly ratio: number;
  readonly rect: LayoutRect;
}) {
  const split = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | undefined>(undefined);
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
    onDraftRatio(undefined);
    onResize(nextRatio);
  };

  return (
    <div
      className="split-boundary"
      data-axis={axis}
      data-node={nodeId}
      data-ratio={ratio}
      ref={split}
      style={rectStyle(rect)}
    >
      <div
        className="resize-handle"
        onPointerCancel={(event) => {
          if (activePointer.current !== event.pointerId) return;
          activePointer.current = undefined;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          onDraftRatio(undefined);
        }}
        onPointerDown={(event) => {
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          onDraftRatio(ratioAtPointer(event));
        }}
        onPointerMove={(event) => {
          if (activePointer.current === event.pointerId) onDraftRatio(ratioAtPointer(event));
        }}
        onPointerUp={finishResize}
        style={axis === 'horizontal' ? { left: `${ratio * 100}%` } : { top: `${ratio * 100}%` }}
      />
    </div>
  );
}

function Pane({ canDrop, dragging, labelContext, onActivate, onClose, onDrop, pane, paneId, rect, root }: {
  readonly canDrop: (target: PaneDropTarget) => boolean;
  readonly dragging: boolean;
  readonly labelContext: (contextId: string) => string;
  readonly onActivate: (contextId: string) => void;
  readonly onClose: (contextId: string) => void;
  readonly onDrop: (target: PaneDropTarget) => void;
  readonly pane: WorkspacePane;
  readonly paneId: WorkspacePaneId;
  readonly rect: LayoutRect;
  readonly root: boolean;
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
      style={rectStyle(rect)}
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
        data-dragging={dragging || undefined}
        data-drop-zone={typeof dropTarget === 'string' ? dropTarget : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const zone = contentDropZone(event);
          previewDrop(zone, { zone });
        }}
        onDrop={(event) => drop(event, { zone: contentDropZone(event) })}
      />
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
