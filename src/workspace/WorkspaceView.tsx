import {
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  type WorkspacePaneId,
} from './durable-state.ts';
import {
  type WorkspaceAction,
  type WorkspacePresentation,
  type WorkspacePresentationPane,
} from './view-state.ts';
import { allocateWorkspaceIds } from './ids.ts';
import { projectWorkspaceLayout, type LayoutRect } from './layout.ts';
import {
  adjacentTabIndex,
  contentDropZone,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  operationForDrop,
  pointInRect,
  splitRatio,
  splitRatioForArrow,
  tabDropIndex,
  type ContentDropZone,
  type PaneDropTarget,
  type WorkspaceDrag,
} from './interaction.ts';

const TAB_DRAG_TYPE = 'application/x-patchpit-context';

export function WorkspaceView({
  canApplyDrop,
  dispatchAction,
  getContextLabel,
  getResourceUrl,
  renderContextContent,
  resourceDragType,
  workspacePresentation,
}: {
  readonly canApplyDrop: (operation: WorkspaceAction) => boolean;
  readonly dispatchAction: (operation: WorkspaceAction) => void;
  readonly getContextLabel: (contextId: string) => string;
  readonly getResourceUrl: (resourceRef: string) => string | undefined;
  readonly renderContextContent: (contextId: string) => ReactNode;
  readonly resourceDragType: string;
  readonly workspacePresentation: WorkspacePresentation;
}) {
  const [drag, setDrag] = useState<WorkspaceDrag>();
  const [draftRatios, setDraftRatios] = useState<Readonly<Record<string, number>>>({});
  const layout = projectWorkspaceLayout(workspacePresentation, draftRatios);
  const operationForCurrentDrop = (paneId: WorkspacePaneId, target: PaneDropTarget) =>
    drag === undefined || (drag.fromResource && drag.sourcePaneId === paneId)
      ? undefined
      : operationForDrop(drag, paneId, target);
  const dropContext = (paneId: WorkspacePaneId, target: PaneDropTarget) => {
    const operation = operationForCurrentDrop(paneId, target);
    setDrag(undefined);
    if (operation !== undefined) dispatchAction(operation);
  };
  const setDraftRatio = (splitId: string, ratio: number | undefined) => {
    setDraftRatios((current) => {
      if (ratio === undefined) {
        if (current[splitId] === undefined) return current;
        return Object.fromEntries(Object.entries(current).filter(([id]) => id !== splitId));
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
        const url = resourceId === '' ? undefined : getResourceUrl(resourceId);
        const allocated = allocateWorkspaceIds();
        const contextId = url === undefined
          ? event.dataTransfer.getData(TAB_DRAG_TYPE)
          : allocated.contextId;
        if (contextId !== '') {
          setDrag({
            allocatedSplitIds: allocated.nodes,
            contentUrl: url,
            contextId,
            fromResource: resourceId !== '',
            sourcePaneId: resourceId === ''
              ? null
              : source?.dataset.pane ?? source?.dataset.contextPane ?? null,
          });
        }
      }}
    >
      <div className="context-layer">
        {layout.contexts.map(({ active, contextId, paneId, rect }) => (
          <div
            aria-labelledby={contextDomId('tab', contextId)}
            className="app"
            data-context-pane={paneId}
            hidden={!active}
            id={contextDomId('panel', contextId)}
            key={contextId}
            onFocusCapture={() => {
              if (active) dispatchAction({ kind: 'workspace.context.activate', paneId, contextId });
            }}
            onPointerDown={() => {
              if (active) dispatchAction({ kind: 'workspace.context.activate', paneId, contextId });
            }}
            role="tabpanel"
            style={rectStyle(rect)}
            tabIndex={0}
          >
            {renderContextContent(contextId)}
          </div>
        ))}
      </div>
      {layout.panes.map(({ pane, paneId, rect }) => (
        <Pane
          key={paneId}
          canAcceptDrop={(target) => {
            const operation = operationForCurrentDrop(paneId, target);
            return operation !== undefined && canApplyDrop(operation);
          }}
          getContextLabel={getContextLabel}
          isActivePane={workspacePresentation.activePaneId === paneId}
          isDragging={drag !== undefined}
          isRootPane={workspacePresentation.rootNodeId === paneId}
          onActivateContext={(contextId) => {
            dispatchAction({ kind: 'workspace.context.activate', paneId, contextId });
          }}
          onCloseContext={(contextId) => {
            dispatchAction({ kind: 'workspace.context.close', paneId, contextId });
          }}
          onDrop={(target) => dropContext(paneId, target)}
          pane={pane}
          paneId={paneId}
          rect={rect}
        />
      ))}
      {layout.splits.map(({ axis, first, ratio, rect, splitId }) => (
        <SplitBoundary
          axis={axis}
          firstChildNodeId={first}
          key={splitId}
          onCommitRatio={(ratio) => {
            dispatchAction({ kind: 'workspace.split.resize', splitId, ratio });
          }}
          onDraftRatioChange={(nextRatio) => setDraftRatio(splitId, nextRatio)}
          ratio={ratio}
          rect={rect}
          splitId={splitId}
        />
      ))}
    </main>
  );
}

const rectStyle = (rect: LayoutRect): CSSProperties => ({
  height: `${rect.height * 100}%`,
  left: `${rect.left * 100}%`,
  top: `${rect.top * 100}%`,
  width: `${rect.width * 100}%`,
});

const contextDomId = (kind: 'panel' | 'tab', contextId: string) =>
  `workspace-${kind}-${encodeURIComponent(contextId)}`;
const nodeDomId = (nodeId: string) => `workspace-node-${encodeURIComponent(nodeId)}`;

function SplitBoundary({ axis, firstChildNodeId, onCommitRatio, onDraftRatioChange, ratio, rect, splitId }: {
  readonly axis: 'horizontal' | 'vertical';
  readonly firstChildNodeId: string;
  readonly onCommitRatio: (ratio: number) => void;
  readonly onDraftRatioChange: (ratio: number | undefined) => void;
  readonly ratio: number;
  readonly rect: LayoutRect;
  readonly splitId: string;
}) {
  const splitBoundary = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | undefined>(undefined);
  const pointerRatio = (event: PointerEvent<HTMLElement>) => {
    const bounds = splitBoundary.current?.getBoundingClientRect();
    if (bounds === undefined) return ratio;
    return splitRatio(axis, pointInRect({ x: event.clientX, y: event.clientY }, bounds));
  };
  const commitPointerResize = (event: PointerEvent<HTMLElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    const nextRatio = pointerRatio(event);
    activePointerId.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onDraftRatioChange(undefined);
    onCommitRatio(nextRatio);
  };

  return (
    <div
      className="split-boundary"
      data-axis={axis}
      data-node={splitId}
      data-ratio={ratio}
      id={nodeDomId(splitId)}
      ref={splitBoundary}
      style={rectStyle(rect)}
    >
      <div
        aria-controls={nodeDomId(firstChildNodeId)}
        aria-label="Resize panes"
        aria-orientation={axis === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-valuemax={MAX_SPLIT_RATIO * 100}
        aria-valuemin={MIN_SPLIT_RATIO * 100}
        aria-valuenow={Math.round(ratio * 100)}
        className="resize-handle"
        onKeyDown={(event) => {
          const nextRatio = splitRatioForArrow(axis, ratio, event.key);
          if (nextRatio === undefined) return;
          event.preventDefault();
          onCommitRatio(nextRatio);
        }}
        onPointerCancel={(event) => {
          if (activePointerId.current !== event.pointerId) return;
          activePointerId.current = undefined;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          onDraftRatioChange(undefined);
        }}
        onPointerDown={(event) => {
          activePointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          onDraftRatioChange(pointerRatio(event));
        }}
        onPointerMove={(event) => {
          if (activePointerId.current === event.pointerId) onDraftRatioChange(pointerRatio(event));
        }}
        onPointerUp={commitPointerResize}
        role="separator"
        style={axis === 'horizontal' ? { left: `${ratio * 100}%` } : { top: `${ratio * 100}%` }}
        tabIndex={0}
      >
        <span aria-hidden="true" className="resize-line" />
      </div>
    </div>
  );
}

function Pane({
  canAcceptDrop,
  getContextLabel,
  isActivePane,
  isDragging,
  isRootPane,
  onActivateContext,
  onCloseContext,
  onDrop,
  pane,
  paneId,
  rect,
}: {
  readonly canAcceptDrop: (target: PaneDropTarget) => boolean;
  readonly getContextLabel: (contextId: string) => string;
  readonly isActivePane: boolean;
  readonly isDragging: boolean;
  readonly isRootPane: boolean;
  readonly onActivateContext: (contextId: string) => void;
  readonly onCloseContext: (contextId: string) => void;
  readonly onDrop: (target: PaneDropTarget) => void;
  readonly pane: WorkspacePresentationPane;
  readonly paneId: WorkspacePaneId;
  readonly rect: LayoutRect;
}) {
  const [dropTarget, setDropTarget] = useState<number | ContentDropZone>();
  const showDropPreview = (preview: number | ContentDropZone, target: PaneDropTarget) => {
    setDropTarget(canAcceptDrop(target) ? preview : undefined);
  };
  const tabDropTarget = (event: DragEvent<HTMLElement>, index: number) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const dropIndex = tabDropIndex(pointInRect({ x: event.clientX, y: event.clientY }, bounds).x, index);
    const target = { beforeContext: pane.contexts[dropIndex] };
    if (canAcceptDrop(target)) return { dropIndex, target };
    const alternateIndex = dropIndex === index ? index + 1 : index;
    return { dropIndex: alternateIndex, target: { beforeContext: pane.contexts[alternateIndex] } };
  };
  const handleDrop = (
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
      id={nodeDomId(paneId)}
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !event.currentTarget.contains(related)) setDropTarget(undefined);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        showDropPreview(pane.contexts.length, { beforeContext: undefined });
      }}
      onDrop={handleDrop}
      style={rectStyle(rect)}
    >
      <div aria-label="Tabs" className="tabs" role="tablist">
        {pane.contexts.map((contextId, index) => {
          const label = getContextLabel(contextId);
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
              data-targeted={isActivePane && pane.activeContext === contextId || undefined}
              key={contextId}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const { dropIndex, target } = tabDropTarget(event, index);
                showDropPreview(dropIndex, target);
              }}
              onDragStart={(event) => event.dataTransfer.setData(TAB_DRAG_TYPE, contextId)}
              onDrop={(event) => handleDrop(event, tabDropTarget(event, index).target)}
              role="presentation"
            >
              <button
                aria-controls={contextDomId('panel', contextId)}
                aria-selected={pane.activeContext === contextId}
                className="tab-label"
                draggable
                id={contextDomId('tab', contextId)}
                onClick={() => onActivateContext(contextId)}
                onKeyDown={(event) => {
                  const nextIndex = adjacentTabIndex(event.key, index, pane.contexts.length);
                  const nextContext = nextIndex === undefined ? undefined : pane.contexts[nextIndex];
                  if (nextIndex === undefined || nextContext === undefined) return;
                  event.preventDefault();
                  onActivateContext(nextContext);
                  event.currentTarget.closest('[role="tablist"]')
                    ?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus();
                }}
                role="tab"
                tabIndex={pane.activeContext === contextId ? 0 : -1}
                type="button"
              >
                {label}
              </button>
              {(pane.contexts.length > 1 || !isRootPane) && (
                <button
                  aria-label={`Close ${label}`}
                  className="tab-close"
                  draggable={false}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseContext(contextId);
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
        data-dragging={isDragging || undefined}
        data-drop-zone={typeof dropTarget === 'string' ? dropTarget : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          const zone = contentDropZone(pointInRect({ x: event.clientX, y: event.clientY }, bounds));
          showDropPreview(zone, { zone });
        }}
        onDrop={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          handleDrop(event, { zone: contentDropZone(pointInRect({ x: event.clientX, y: event.clientY }, bounds)) });
        }}
      />
    </section>
  );
}
