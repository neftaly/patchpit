import type {
  WorkspaceAction,
} from './view-state.ts';
import type {
  WorkspacePaneId,
  WorkspaceSplitEdge,
  WorkspaceSplitIds,
} from './durable-state.ts';

export const MIN_SPLIT_RATIO = 0.1;
export const MAX_SPLIT_RATIO = 0.9;
const EDGE_DROP_THRESHOLD = 1 / 3;
const SPLIT_KEYBOARD_STEP = 0.05;

export type ContentDropZone = WorkspaceSplitEdge | 'center';

export type WorkspaceDrag = {
  readonly allocatedSplitIds: WorkspaceSplitIds;
  readonly contentUrl: string | undefined;
  readonly contextId: string;
  readonly fromResource: boolean;
  readonly pinOnDrop: boolean;
  readonly sourcePaneId: string | null;
};

export type PaneDropTarget = { readonly beforeContext: string | undefined } | {
  readonly zone: ContentDropZone;
};

type Point = { readonly x: number; readonly y: number };
type Rect = {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
};

export const pointInRect = (point: Point, rect: Rect): Point => ({
  x: (point.x - rect.left) / rect.width,
  y: (point.y - rect.top) / rect.height,
});

export const splitRatio = (axis: 'horizontal' | 'vertical', point: Point) =>
  Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, axis === 'horizontal' ? point.x : point.y));

export const tabDropIndex = (x: number, index: number) => x < 0.5 ? index : index + 1;

export const adjacentTabIndex = (key: string, index: number, length: number) => {
  if (key === 'ArrowLeft') return (index - 1 + length) % length;
  if (key === 'ArrowRight') return (index + 1) % length;
  return undefined;
};

export const splitRatioForArrow = (axis: 'horizontal' | 'vertical', ratio: number, key: string) => {
  const direction = axis === 'horizontal'
    ? { ArrowLeft: -1, ArrowRight: 1 }[key]
    : { ArrowUp: -1, ArrowDown: 1 }[key];
  return direction === undefined
    ? undefined
    : Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio + (direction * SPLIT_KEYBOARD_STEP)));
};

export const contentDropZone = ({ x, y }: Point): ContentDropZone => {
  const edges: readonly [WorkspaceSplitEdge, number][] = [
    ['left', x],
    ['right', 1 - x],
    ['top', y],
    ['bottom', 1 - y],
  ];
  const [edge, distance] = edges.reduce((closest, candidate) => (
    candidate[1] < closest[1] ? candidate : closest
  ));
  return distance < EDGE_DROP_THRESHOLD ? edge : 'center';
};

export const operationForDrop = (
  drag: WorkspaceDrag,
  paneId: WorkspacePaneId,
  target: PaneDropTarget,
): WorkspaceAction => 'zone' in target && target.zone !== 'center'
  ? {
      kind: 'workspace.context.split',
      contextId: drag.contextId,
      targetPaneId: paneId,
      edge: target.zone,
      ids: drag.allocatedSplitIds,
      url: drag.contentUrl ?? null,
    }
  : {
      kind: 'workspace.context.move',
      contextId: drag.contextId,
      targetPaneId: paneId,
      beforeContext: 'beforeContext' in target ? target.beforeContext ?? null : null,
      url: drag.contentUrl ?? null,
      pin: drag.pinOnDrop,
    };
