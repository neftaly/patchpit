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
  canStartResize,
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

type WorkspaceDragSession = {
  readonly drag: WorkspaceDrag;
  readonly preview?: {
    readonly paneId: WorkspacePaneId;
    readonly target: number | ContentDropZone;
  };
};

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
  readonly renderContextContent: (contextId: string, onInteract: () => void) => ReactNode;
  readonly resourceDragType: string;
  readonly workspacePresentation: WorkspacePresentation;
}) {
  const [dragSession, setDragSession] = useState<WorkspaceDragSession>();
  const [draftRatios, setDraftRatios] = useState<Readonly<Record<string, number>>>({});
  const layout = projectWorkspaceLayout(workspacePresentation, draftRatios);
  const drag = dragSession?.drag;
  const operationForCurrentDrop = (paneId: WorkspacePaneId, target: PaneDropTarget) =>
    drag === undefined || (drag.fromResource && drag.sourcePaneId === paneId)
      ? undefined
      : operationForDrop(drag, paneId, target);
  const dropContext = (paneId: WorkspacePaneId, target: PaneDropTarget) => {
    const operation = operationForCurrentDrop(paneId, target);
    setDragSession(undefined);
    if (operation !== undefined) dispatchAction(operation);
  };
  const previewDrop = (paneId: WorkspacePaneId, preview: number | ContentDropZone) => {
    setDragSession((current) => current === undefined
      ? current
      : { ...current, preview: { paneId, target: preview } });
  };
  const clearDropPreview = (paneId: WorkspacePaneId) => {
    setDragSession((current) => current?.preview?.paneId === paneId
      ? { drag: current.drag }
      : current);
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
      onDragEnd={() => setDragSession(undefined)}
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
          setDragSession({
            drag: {
              allocatedSplitIds: allocated.nodes,
              contentUrl: url,
              contextId,
              fromResource: resourceId !== '',
              sourcePaneId: resourceId === ''
                ? null
                : source?.dataset.pane ?? source?.dataset.contextPane ?? null,
            },
          });
        }
      }}
    >
      <div className="context-layer">
        {layout.contexts.map(({ contextId, paneId, rect, selected }) => {
          const selectContext = () => {
            if (selected) dispatchAction({ kind: 'workspace.context.select', contextId });
          };
          return (
            <div
              aria-labelledby={contextDomId('tab', contextId)}
              className="app"
              data-context-pane={paneId}
              hidden={!selected}
              id={contextDomId('panel', contextId)}
              key={contextId}
              onFocusCapture={selectContext}
              onPointerDownCapture={selectContext}
              role="tabpanel"
              style={rectStyle(rect)}
              tabIndex={0}
            >
              {renderContextContent(contextId, selectContext)}
            </div>
          );
        })}
      </div>
      {layout.panes.map(({ pane, paneId, rect }) => (
        <Pane
          key={paneId}
          canAcceptDrop={(target) => {
            const operation = operationForCurrentDrop(paneId, target);
            return operation !== undefined && canApplyDrop(operation);
          }}
          dropTarget={dragSession?.preview?.paneId === paneId ? dragSession.preview.target : undefined}
          getContextLabel={getContextLabel}
          activeEditorContextId={workspacePresentation.activeEditorContextId}
          isDragging={drag !== undefined}
          isRootPane={workspacePresentation.rootNodeId === paneId}
          onActivateContext={(contextId) => {
            dispatchAction({ kind: 'workspace.context.select', contextId });
          }}
          onCloseContext={(contextId) => {
            dispatchAction({ kind: 'workspace.context.close', paneId, contextId });
          }}
          onClearDropPreview={() => clearDropPreview(paneId)}
          onDrop={(target) => dropContext(paneId, target)}
          onPreviewDrop={(preview) => previewDrop(paneId, preview)}
          pane={pane}
          paneId={paneId}
          rect={rect}
        />
      ))}
      {layout.splits.map(({ axis, first, ratio, rect, second, splitId }) => (
        <SplitBoundary
          axis={axis}
          childNodeIds={[first, second]}
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

function SplitBoundary({ axis, childNodeIds, onCommitRatio, onDraftRatioChange, ratio, rect, splitId }: {
  readonly axis: 'horizontal' | 'vertical';
  readonly childNodeIds: readonly [string, string];
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
  const cancelPointerResize = (event: PointerEvent<HTMLElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    activePointerId.current = undefined;
    onDraftRatioChange(undefined);
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
        aria-controls={childNodeIds.map(nodeDomId).join(' ')}
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
        onLostPointerCapture={cancelPointerResize}
        onPointerCancel={cancelPointerResize}
        onPointerDown={(event) => {
          if (activePointerId.current !== undefined
            || !canStartResize(event.pointerType, event.button, event.isPrimary)) return;
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
  activeEditorContextId,
  canAcceptDrop,
  dropTarget,
  getContextLabel,
  isDragging,
  isRootPane,
  onActivateContext,
  onCloseContext,
  onClearDropPreview,
  onDrop,
  onPreviewDrop,
  pane,
  paneId,
  rect,
}: {
  readonly activeEditorContextId: string | null;
  readonly canAcceptDrop: (target: PaneDropTarget) => boolean;
  readonly dropTarget: number | ContentDropZone | undefined;
  readonly getContextLabel: (contextId: string) => string;
  readonly isDragging: boolean;
  readonly isRootPane: boolean;
  readonly onActivateContext: (contextId: string) => void;
  readonly onCloseContext: (contextId: string) => void;
  readonly onClearDropPreview: () => void;
  readonly onDrop: (target: PaneDropTarget) => void;
  readonly onPreviewDrop: (preview: number | ContentDropZone) => void;
  readonly pane: WorkspacePresentationPane;
  readonly paneId: WorkspacePaneId;
  readonly rect: LayoutRect;
}) {
  const showDropPreview = (preview: number | ContentDropZone, target: PaneDropTarget) => {
    if (canAcceptDrop(target)) onPreviewDrop(preview);
    else onClearDropPreview();
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
    onClearDropPreview();
    onDrop(target);
  };
  return (
    <section
      className="pane"
      data-pane={paneId}
      id={nodeDomId(paneId)}
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !event.currentTarget.contains(related)) onClearDropPreview();
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
              data-selected={pane.selectedContext === contextId || undefined}
              data-context={contextId}
              data-drop-target={dropTarget === index
                ? 'before'
                : dropTarget === pane.contexts.length && index === pane.contexts.length - 1
                  ? 'after'
                  : undefined}
              data-preview={pane.previewContext === contextId || undefined}
              data-active-editor={activeEditorContextId === contextId || undefined}
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
                aria-description={activeEditorContextId === contextId
                  ? 'Active editor'
                  : undefined}
                aria-selected={pane.selectedContext === contextId}
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
                tabIndex={pane.selectedContext === contextId ? 0 : -1}
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
