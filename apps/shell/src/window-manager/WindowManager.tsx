import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  type SplitDirection,
  SurfaceRole,
  WindowManagerNodeKind,
  type WindowContext,
  type WindowLayoutNode,
  type WindowManagerStateDoc,
  type WindowSurface,
} from '@patchpit/system';
import {
  type ContentDropZone,
  type ContextDropTarget,
  type ContextMovePlacement,
  type SplitPath,
} from './window-manager-state';
import './window-manager.css';

type WindowManagerActions = {
  readonly closeContext: (surfaceId: string, contextId: string) => void;
  readonly dropContext: (sourceSurfaceId: string, contextId: string, target: ContextDropTarget) => void;
  readonly focusContext: (surfaceId: string, contextId: string) => void;
  readonly pinContext: (surfaceId: string, contextId: string) => void;
  readonly resizeSplit: (path: SplitPath, ratio: number) => Promise<boolean>;
};

export type WindowManagerAppHost = {
  contextLabel(context: WindowContext): string | undefined;
  contextTooltip(context: WindowContext): string | undefined;
  renderSurface(input: {
    readonly context: WindowContext | undefined;
    readonly surfaceId: string;
  }): ReactNode;
};

export type WindowManagerWorkspace = Pick<WindowManagerStateDoc, 'contexts' | 'focus' | 'layout' | 'surfaces'>;

type WindowManagerRuntime = {
  readonly actions: WindowManagerActions;
  readonly appHost: WindowManagerAppHost;
  readonly contexts: Readonly<Record<string, WindowContext>>;
  readonly draggedTab: DraggedTab | undefined;
  readonly dragShieldActive: boolean;
  readonly dropTarget: DropTarget | undefined;
  readonly setDragShieldActive: (active: boolean) => void;
  readonly setDraggedTab: (tab: DraggedTab | undefined) => void;
  readonly setDropTarget: (target: DropTarget | undefined) => void;
  readonly surfaces: Readonly<Record<string, WindowSurface>>;
};

type DropTarget = ContextDropTarget;
type ActiveSplitResize = {
  readonly baseRatio: number;
  readonly pointerId: number;
  ratio: number;
};
type SplitResizeDraft = {
  readonly commitId?: number;
  readonly phase: 'dragging' | 'pending';
  readonly baseRatio: number;
  readonly ratio: number;
};
const doublePointerActivationMs = 500;
let lastPrimaryPointerActivation: {
  readonly at: number;
  readonly count: number;
  readonly key: string;
  readonly pointerType: string;
} | undefined;

export function WindowManager({
  actions,
  appHost,
  workspace,
}: {
  readonly actions: WindowManagerActions;
  readonly appHost: WindowManagerAppHost;
  readonly workspace: WindowManagerWorkspace;
}) {
  const [draggedTab, setDraggedTab] = useState<DraggedTab>();
  const [dragShieldActive, setDragShieldActive] = useState(false);
  const [dropTarget, setDropTargetState] = useState<DropTarget>();
  const setDropTarget = (target: DropTarget | undefined) => {
    setDropTargetState((current) => sameDropTarget(current, target) ? current : target);
  };
  const runtime = {
    actions,
    appHost,
    contexts: workspace.contexts,
    draggedTab,
    dragShieldActive,
    dropTarget,
    setDragShieldActive,
    setDraggedTab,
    setDropTarget,
    surfaces: workspace.surfaces,
  };

  return (
    <section
      className="window-manager"
      aria-label="window manager"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes(tabDragType)) setDragShieldActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragShieldActive(false);
          setDropTarget(undefined);
        }
      }}
      onDragEnd={() => {
        setDraggedTab(undefined);
        setDragShieldActive(false);
        setDropTarget(undefined);
      }}
      onDrop={() => {
        setDragShieldActive(false);
      }}
    >
      <LayoutNodeView node={workspace.layout} path={[]} runtime={runtime} />
    </section>
  );
}

function LayoutNodeView({
  node,
  path,
  runtime,
  style,
}: {
  readonly node: WindowLayoutNode;
  readonly path: SplitPath;
  readonly runtime: WindowManagerRuntime;
  readonly style?: CSSProperties | undefined;
}) {
  if (node.kind === WindowManagerNodeKind.Split) {
    return <SplitView node={node} path={path} runtime={runtime} style={style} />;
  }

  const surface = runtime.surfaces[node.surfaceId];
  return surface === undefined
    ? null
    : <SurfaceView path={path} runtime={runtime} style={style} surface={surface} />;
}

function SplitView({
  node,
  path,
  runtime,
  style,
}: {
  readonly node: Extract<WindowLayoutNode, { kind: WindowManagerNodeKind.Split }>;
  readonly path: SplitPath;
  readonly runtime: WindowManagerRuntime;
  readonly style?: CSSProperties | undefined;
}) {
  const splitRef = useRef<HTMLDivElement>(null);
  const activeResize = useRef<ActiveSplitResize | undefined>(undefined);
  const nextResizeCommitId = useRef(0);
  const [resizeDraft, setResizeDraft] = useState<SplitResizeDraft>();
  const ratio = resizeDraft?.ratio ?? node.ratio;

  useEffect(() => {
    setResizeDraft((draft) => {
      if (draft === undefined || draft.phase === 'dragging') return draft;
      if (sameRatio(node.ratio, draft.ratio) || !sameRatio(node.ratio, draft.baseRatio)) return undefined;
      return draft;
    });
  }, [node.ratio]);

  useEffect(() => {
    if (resizeDraft?.phase !== 'pending' || resizeDraft.commitId === undefined) return undefined;

    const commitId = resizeDraft.commitId;
    const timeout = window.setTimeout(() => {
      setResizeDraft((draft) => (
        draft?.phase === 'pending' && draft.commitId === commitId ? undefined : draft
      ));
    }, splitResizeConfirmationTimeoutMs);

    return () => window.clearTimeout(timeout);
  }, [resizeDraft]);

  const beginResize = (event: PointerEvent<HTMLButtonElement>) => {
    const draftRatio = resizeRatioFromPointer(event, splitRef.current, node.direction);
    if (draftRatio === undefined) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    activeResize.current = {
      baseRatio: node.ratio,
      pointerId: event.pointerId,
      ratio: draftRatio,
    };
    setResizeDraft({ phase: 'dragging', baseRatio: node.ratio, ratio: draftRatio });
  };
  const updateResize = (event: PointerEvent<HTMLButtonElement>) => {
    const active = activeResize.current;
    if (active?.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;

    const draftRatio = resizeRatioFromPointer(event, splitRef.current, node.direction);
    if (draftRatio === undefined) return;

    active.ratio = draftRatio;
    setResizeDraft({ phase: 'dragging', baseRatio: active.baseRatio, ratio: draftRatio });
  };
  const finishResize = (event: PointerEvent<HTMLButtonElement>, usePointerPosition: boolean) => {
    const active = activeResize.current;
    if (active?.pointerId !== event.pointerId) return;

    const finalRatio = usePointerPosition
      ? resizeRatioFromPointer(event, splitRef.current, node.direction) ?? active.ratio
      : active.ratio;
    activeResize.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (sameRatio(finalRatio, node.ratio)) {
      setResizeDraft(undefined);
      return;
    }

    const commitId = nextResizeCommitId.current + 1;
    nextResizeCommitId.current = commitId;
    setResizeDraft({ commitId, phase: 'pending', baseRatio: active.baseRatio, ratio: finalRatio });
    void runtime.actions.resizeSplit(path, finalRatio)
      .then((committed) => {
        if (committed) return;
        setResizeDraft((draft) => (
          draft?.phase === 'pending' && draft.commitId === commitId ? undefined : draft
        ));
      })
      .catch(() => {
        setResizeDraft((draft) => (
          draft?.phase === 'pending' && draft.commitId === commitId ? undefined : draft
        ));
      });
  };

  return (
    <div
      className={`window-manager-split window-manager-split-${node.direction}`}
      ref={splitRef}
      style={style}
    >
      <LayoutNodeView
        node={node.first}
        path={[...path, 'first']}
        runtime={runtime}
        style={splitChildStyle(ratio)}
      />
      <button
        aria-label="Resize surfaces"
        className="window-manager-resize-handle"
        onLostPointerCapture={(event) => finishResize(event, false)}
        onPointerCancel={(event) => finishResize(event, false)}
        onPointerDown={beginResize}
        onPointerMove={updateResize}
        onPointerUp={(event) => finishResize(event, true)}
        type="button"
      />
      <LayoutNodeView
        node={node.second}
        path={[...path, 'second']}
        runtime={runtime}
        style={splitChildStyle(1 - ratio)}
      />
    </div>
  );
}

function SurfaceView({
  path,
  runtime,
  surface,
  style,
}: {
  readonly path: SplitPath;
  readonly runtime: WindowManagerRuntime;
  readonly surface: WindowSurface;
  readonly style?: CSSProperties | undefined;
}) {
  const tabIds = surface.previewContext === undefined
    ? surface.contexts
    : [...surface.contexts, surface.previewContext];
  const selectedContextId = tabIds.find((contextId) => contextId === surface.activeContext) ?? tabIds.at(0);
  const selectedContext = selectedContextId === undefined ? undefined : runtime.contexts[selectedContextId];
  const showTabs = surface.role === SurfaceRole.DocumentSet && tabIds.length > 0;
  const dropTarget = runtime.dropTarget?.surfaceId === surface.id ? runtime.dropTarget : undefined;

  return (
    <section
      className="window-manager-surface"
      aria-label="window surface"
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          runtime.setDropTarget(undefined);
        }
      }}
      style={style}
    >
      {showTabs && (
        <header className="window-manager-surface-header">
          <div
            className="window-manager-tabs"
            data-drop-target={dropTarget?.area === 'tabs' ? '' : undefined}
            onDragOver={(event) => {
              acceptDrag(event, runtime, { area: 'tabs', surfaceId: surface.id }, true);
            }}
            onDrop={(event) => {
              dropDraggedItem(event, runtime, (dragged) => {
                dropItem(runtime, dragged, { area: 'tabs', surfaceId: surface.id });
              }, true);
            }}
            role="tablist"
            aria-label="open windows"
          >
            {tabIds.map((contextId) => {
              const label = contextLabel(runtime, contextId);
              const tooltip = contextTooltip(runtime, contextId);
              const tabDropTarget = dropTarget?.area === 'tabs' && dropTarget.contextId === contextId
                ? dropTarget.placement
                : undefined;
              return (
                <div
                  aria-selected={contextId === selectedContextId}
                  className="window-manager-tab"
                  data-drop-target={tabDropTarget}
                  data-preview={contextId === surface.previewContext ? '' : undefined}
                  data-selected={contextId === selectedContextId ? '' : undefined}
                  draggable
                  key={contextId}
                  onPointerUp={(event) => {
                    const activationCount = primaryPointerActivationCount(event, `${surface.id}:${contextId}`);
                    if (activationCount === 0) return;
                    if (activationCount >= 2) runtime.actions.pinContext(surface.id, contextId);
                    else runtime.actions.focusContext(surface.id, contextId);
                  }}
                  onDragOver={(event) => {
                    acceptDrag(event, runtime, {
                      area: 'tabs',
                      contextId,
                      placement: tabDropPlacement(event, tabIds, runtime.draggedTab, surface.id, contextId),
                      surfaceId: surface.id,
                    }, true);
                  }}
                  onDragStart={(event) => {
                    const dragged = { contextId, surfaceId: surface.id };
                    runtime.setDraggedTab(dragged);
                    runtime.setDragShieldActive(true);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(tabDragType, JSON.stringify(dragged));
                  }}
                  onDragEnd={() => {
                    runtime.setDraggedTab(undefined);
                    runtime.setDragShieldActive(false);
                    runtime.setDropTarget(undefined);
                  }}
                  onDrop={(event) => {
                    dropDraggedItem(event, runtime, (dragged) => {
                      dropItem(runtime, dragged, {
                        area: 'tabs',
                        contextId,
                        placement: tabDropPlacement(
                          event,
                          tabIds,
                          dragged.kind === 'tab' ? dragged : undefined,
                          surface.id,
                          contextId,
                        ),
                        surfaceId: surface.id,
                      });
                    }, true);
                  }}
                  onKeyDown={(event) => {
                    if (isActivationKey(event)) runtime.actions.focusContext(surface.id, contextId);
                  }}
                  role="tab"
                  tabIndex={0}
                  title={tooltip ?? label}
                >
                  <span className="window-manager-tab-label">{label}</span>
                  <button
                    aria-label={`Close ${label}`}
                    className="window-manager-tab-icon"
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      if (!isPrimaryPointer(event)) return;
                      runtime.actions.closeContext(surface.id, contextId);
                    }}
                    draggable={false}
                    title="Close window"
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </header>
      )}
      <div
        className="window-manager-content"
        data-drop-zone={dropTarget?.area === 'content' ? dropTarget.zone : undefined}
        onDragOver={(event) => {
          if (surface.role === SurfaceRole.DocumentSet) {
            acceptDrag(event, runtime, contentDropTarget(event, path, surface.id));
          }
        }}
        onDrop={(event) => {
          if (surface.role === SurfaceRole.DocumentSet) {
            dropDraggedItem(event, runtime, (dragged) => {
              dropItem(runtime, dragged, contentDropTarget(event, path, surface.id));
            });
          }
        }}
      >
        {runtime.dragShieldActive && (
          <div className="window-manager-drag-shield" aria-hidden="true" />
        )}
        {runtime.appHost.renderSurface({ context: selectedContext, surfaceId: surface.id })}
      </div>
    </section>
  );
}

function isActivationKey(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter' && event.key !== ' ') return false;
  event.preventDefault();
  return true;
}

function primaryPointerActivationCount(event: PointerEvent, key: string): number {
  if (!isPrimaryPointer(event)) return 0;
  const previous = lastPrimaryPointerActivation;
  const count = previous?.key === key
    && previous.pointerType === event.pointerType
    && event.timeStamp - previous.at <= doublePointerActivationMs
      ? previous.count + 1
      : 1;
  lastPrimaryPointerActivation = { at: event.timeStamp, count, key, pointerType: event.pointerType };
  return count;
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.isPrimary && (event.pointerType !== 'mouse' || event.button === 0);
}

const tabDragType = 'application/x.patchpit-tab';

function acceptDrag(
  event: DragEvent,
  runtime: WindowManagerRuntime,
  target: DropTarget,
  stopPropagation = false,
): void {
  if (!allowDrop(event)) return;
  if (!canDrop(runtime.draggedTab, target)) {
    runtime.setDropTarget(undefined);
    return;
  }
  if (stopPropagation) event.stopPropagation();
  runtime.setDragShieldActive(true);
  runtime.setDropTarget(target);
}

function allowDrop(event: DragEvent): boolean {
  if (!event.dataTransfer.types.includes(tabDragType)) return false;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  return true;
}

function dropDraggedItem(
  event: DragEvent,
  runtime: WindowManagerRuntime,
  handleDrop: (dragged: DraggedItem) => void,
  stopPropagation = false,
): void {
  const dragged = draggedItemFromEvent(event);
  if (dragged === undefined) return;

  event.preventDefault();
  if (stopPropagation) event.stopPropagation();
  runtime.setDraggedTab(undefined);
  runtime.setDragShieldActive(false);
  runtime.setDropTarget(undefined);
  handleDrop(dragged);
}

type DraggedTab = { contextId: string; surfaceId: string };
type DraggedItem = { kind: 'tab' } & DraggedTab;

function dropItem(runtime: WindowManagerRuntime, dragged: DraggedItem, target: ContextDropTarget): void {
  runtime.actions.dropContext(dragged.surfaceId, dragged.contextId, target);
}

function draggedItemFromEvent(event: DragEvent): DraggedItem | undefined {
  const tab = dragDataFromEvent<DraggedTab>(event, tabDragType);
  return tab === undefined ? undefined : { kind: 'tab', ...tab };
}

function dragDataFromEvent<T>(event: DragEvent, type: string): T | undefined {
  const serializedDragData = event.dataTransfer.getData(type);
  if (serializedDragData === '') return undefined;
  try {
    return JSON.parse(serializedDragData) as T;
  } catch {
    return undefined;
  }
}

function canDrop(dragged: DraggedTab | undefined, target: DropTarget): boolean {
  if (dragged === undefined) return true;
  if (target.area === 'tabs' && target.contextId === dragged.contextId) return false;
  return target.area !== 'content' || target.zone !== 'center' || target.surfaceId !== dragged.surfaceId;
}

const edgeDropThreshold = 1 / 3;

function contentDropTarget(
  event: DragEvent<HTMLElement>,
  path: SplitPath,
  surfaceId: string,
): ContextDropTarget {
  return {
    area: 'content',
    path,
    surfaceId,
    zone: contentDropZone(event),
  };
}

function contentDropZone(event: DragEvent<HTMLElement>): ContentDropZone {
  const contentRect = event.currentTarget.getBoundingClientRect();
  const horizontalPosition = (event.clientX - contentRect.left) / contentRect.width;
  const verticalPosition = (event.clientY - contentRect.top) / contentRect.height;
  const edgeDistances: [ContentDropZone, number][] = [
    ['left', horizontalPosition],
    ['right', 1 - horizontalPosition],
    ['top', verticalPosition],
    ['bottom', 1 - verticalPosition],
  ];
  const closestEdge = edgeDistances.reduce((best, edgeDistance) => (
    edgeDistance[1] < best[1] ? edgeDistance : best
  ));
  return closestEdge[1] < edgeDropThreshold ? closestEdge[0] : 'center';
}

function tabDropPlacement(
  event: DragEvent<HTMLElement>,
  tabIds: readonly string[],
  dragged: DraggedTab | undefined,
  targetSurfaceId: string,
  targetContextId: string,
): ContextMovePlacement {
  if (dragged?.surfaceId === targetSurfaceId) {
    const draggedIndex = tabIds.indexOf(dragged.contextId);
    const targetIndex = tabIds.indexOf(targetContextId);
    if (draggedIndex !== -1 && targetIndex !== -1 && Math.abs(draggedIndex - targetIndex) === 1) {
      return draggedIndex < targetIndex ? 'after' : 'before';
    }
  }

  const tabRect = event.currentTarget.getBoundingClientRect();
  return event.clientX < tabRect.left + tabRect.width / 2 ? 'before' : 'after';
}

function sameDropTarget(left: DropTarget | undefined, right: DropTarget | undefined): boolean {
  if (left?.area !== right?.area || left?.surfaceId !== right?.surfaceId) return false;
  if (left === undefined || right === undefined) return true;
  if (left.area === 'tabs' && right.area === 'tabs') {
    return left.contextId === right.contextId && left.placement === right.placement;
  }
  if (left.area === 'content' && right.area === 'content') {
    return samePath(left.path, right.path) && left.zone === right.zone;
  }
  return false;
}

function samePath(left: SplitPath | undefined, right: SplitPath | undefined): boolean {
  return left?.length === right?.length && left?.every((side, index) => side === right?.[index]) === true;
}

function splitChildStyle(size = 1): CSSProperties {
  return { flex: `${size} 1 0` };
}

const minSplitRatio = 0.05;
const maxSplitRatio = 0.95;
const splitResizeConfirmationTimeoutMs = 1_500;
const splitRatioEpsilon = 0.0001;

function clampedSplitRatio(ratio: number): number {
  return Math.min(maxSplitRatio, Math.max(minSplitRatio, ratio));
}

function sameRatio(left: number, right: number): boolean {
  return Math.abs(left - right) < splitRatioEpsilon;
}

function contextLabel(runtime: WindowManagerRuntime, contextId: string): string {
  const context = runtime.contexts[contextId];
  if (context === undefined) return contextId;
  return runtime.appHost.contextLabel(context) ?? context.title ?? context.url;
}

function contextTooltip(runtime: WindowManagerRuntime, contextId: string): string | undefined {
  const context = runtime.contexts[contextId];
  return context === undefined ? undefined : runtime.appHost.contextTooltip(context);
}

function resizeRatioFromPointer(
  event: PointerEvent,
  split: HTMLDivElement | null,
  direction: SplitDirection,
): number | undefined {
  if (split === null) return undefined;
  event.preventDefault();

  const splitRect = split.getBoundingClientRect();
  const pointerOffset = direction === 'row' ? event.clientX - splitRect.left : event.clientY - splitRect.top;
  const splitSize = direction === 'row' ? splitRect.width : splitRect.height;
  return splitSize <= 0 ? undefined : clampedSplitRatio(pointerOffset / splitSize);
}
