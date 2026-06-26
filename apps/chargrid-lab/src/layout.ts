import type { GridDirection, GridNode, PositionedNode, Rect } from './types';

type ChildSize = {
  readonly node: GridNode;
  readonly main: number;
  readonly minor: number;
};

export function layoutTree(node: GridNode, rect: Rect): readonly PositionedNode[] {
  if (node.kind === 'container') {
    return layoutChildren(node.direction, rect, node.children, node.gap ?? 0).flatMap(({ node: child, rect: childRect }) =>
      layoutTree(child, childRect)
    );
  }

  if (node.kind === 'box') {
    const own: PositionedNode = { node, rect };
    const childRect = {
      x: rect.x + 1 + (node.padding ?? 0),
      y: rect.y + 1 + (node.padding ?? 0),
      width: Math.max(0, rect.width - 2 - (node.padding ?? 0) * 2),
      height: Math.max(0, rect.height - 2 - (node.padding ?? 0) * 2)
    };

    const children = layoutChildren(node.direction ?? 'column', childRect, node.children, node.gap ?? 0).flatMap(
      ({ node: child, rect: childLayout }) => layoutTree(child, childLayout)
    );

    return [own, ...children];
  }

  return [{ node, rect }];
}

export function layoutChildren(
  direction: GridDirection,
  rect: Rect,
  children: readonly GridNode[],
  gap: number
): readonly PositionedNode[] {
  if (children.length === 0) {
    return [];
  }

  const mainSize = direction === 'row' ? rect.width : rect.height;
  const minorSize = direction === 'row' ? rect.height : rect.width;
  const totalGap = Math.max(0, children.length - 1) * gap;
  const availableMain = Math.max(0, mainSize - totalGap);
  const fixed = children.map((node) => measureChild(direction, node, minorSize));
  const fixedMain = fixed.reduce((total, child) => total + child.main, 0);
  const growTotal = children.reduce((total, child) => total + (child.grow ?? 0), 0);
  const growRemainder = Math.max(0, availableMain - fixedMain);
  let allocatedGrow = 0;
  let cursor = direction === 'row' ? rect.x : rect.y;

  const lastGrowIndex = lastIndexWhere(fixed, (item) => item.node.grow !== undefined);

  return fixed.map((child, index) => {
    const growShare =
      child.node.grow === undefined || growTotal === 0 ? 0 : Math.floor((growRemainder * child.node.grow) / growTotal);
    const isLastGrow = child.node.grow !== undefined && index === lastGrowIndex;
    const assignedGrow = isLastGrow ? growRemainder - allocatedGrow : growShare;
    allocatedGrow += assignedGrow;
    const main = child.main + assignedGrow;

    const childRect =
      direction === 'row'
        ? {
            x: cursor,
            y: rect.y,
            width: Math.max(0, main),
            height: Math.min(rect.height, child.minor)
          }
        : {
            x: rect.x,
            y: cursor,
            width: Math.min(rect.width, child.minor),
            height: Math.max(0, main)
          };

    cursor += main + gap;
    return { node: child.node, rect: childRect };
  });
}

function lastIndexWhere<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) {
      return index;
    }
  }

  return -1;
}

function measureChild(direction: GridDirection, node: GridNode, minorFallback: number): ChildSize {
  const explicitMain = direction === 'row' ? node.width : node.height;
  const explicitMinor = direction === 'row' ? node.height : node.width;
  const main = explicitMain ?? preferredMain(direction, node);
  const minor = explicitMinor ?? minorFallback;

  return { node, main, minor };
}

function preferredMain(direction: GridDirection, node: GridNode): number {
  if (node.kind === 'text') {
    return direction === 'row' ? Math.max(...node.text.split('\n').map((line) => line.length), 1) : node.text.split('\n').length;
  }

  if (node.kind === 'media') {
    return direction === 'row' ? node.snap.columns + 2 : node.snap.rows + 2;
  }

  if (node.kind === 'cube') {
    return direction === 'row' ? 24 : 12;
  }

  return 1;
}
