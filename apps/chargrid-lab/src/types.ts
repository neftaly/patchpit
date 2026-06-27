export type CellTone = 'ink' | 'muted' | 'accent' | 'panel' | 'media' | 'cube' | 'warning';

export type Cell = {
  readonly char: string;
  readonly tone?: CellTone;
};

export type GridBuffer = {
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly Cell[];
};

export type GridMetrics = {
  readonly chPx: number;
  readonly linePx: number;
};

export type SnappedGrid = {
  readonly columns: number;
  readonly rows: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly ghostRightPx: number;
  readonly ghostBottomPx: number;
};

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type GridDirection = 'row' | 'column';

export type GridNode = ContainerNode | BoxNode | TextNode | MediaNode | CubeNode;

export type BaseNode = {
  readonly id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly grow?: number;
};

export type ContainerNode = BaseNode & {
  readonly kind: 'container';
  readonly direction: GridDirection;
  readonly gap?: number;
  readonly children: readonly GridNode[];
};

export type BoxNode = BaseNode & {
  readonly kind: 'box';
  readonly title?: string;
  readonly tone?: CellTone;
  readonly padding?: number;
  readonly direction?: GridDirection;
  readonly gap?: number;
  readonly children: readonly GridNode[];
};

export type TextNode = BaseNode & {
  readonly kind: 'text';
  readonly text: string;
  readonly tone?: CellTone;
};

export type MediaNode = BaseNode & {
  readonly kind: 'media';
  readonly label: string;
  readonly targetWidthPx: number;
  readonly targetHeightPx: number;
  readonly snap: SnappedGrid;
};

export type CubeNode = BaseNode & {
  readonly kind: 'cube';
  readonly label: string;
};

export type PositionedNode = {
  readonly node: GridNode;
  readonly rect: Rect;
};
