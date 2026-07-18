type CaretDocument = Document & {
  readonly caretPositionFromPoint?: (x: number, y: number) => {
    readonly offsetNode: Node;
    readonly offset: number;
  } | null;
  readonly caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

type TextPoint = {
  readonly node: Node;
  readonly offset: number;
};

export const textOffsetAtPoint = (
  root: HTMLElement,
  x: number,
  y: number,
): number | undefined => {
  const document = root.ownerDocument as CaretDocument;
  const position = document.caretPositionFromPoint?.(x, y);
  if (position !== undefined && position !== null) {
    return offsetWithin(root, position.offsetNode, position.offset);
  }
  const range = document.caretRangeFromPoint?.(x, y);
  return range === undefined || range === null
    ? undefined
    : offsetWithin(root, range.startContainer, range.startOffset);
};

export const caretBounds = (root: HTMLElement, offset: number): DOMRect | undefined => {
  const point = textPointAtOffset(root, offset);
  if (point === undefined) return undefined;
  const range = root.ownerDocument.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const collapsed = range.getBoundingClientRect();
  if (collapsed.height > 0) return collapsed;

  const adjacentStart = offset === 0 ? 0 : offset - 1;
  const adjacentEnd = Math.min(root.textContent?.length ?? 0, offset + 1);
  const adjacent = textRangeBounds(root, adjacentStart, adjacentEnd);
  if (adjacent === undefined) return root.getBoundingClientRect();
  const x = offset === 0 ? adjacent.left : adjacent.right;
  return new DOMRect(x, adjacent.top, 0, adjacent.height);
};

export const characterBounds = (
  root: HTMLElement,
  start: number,
  end: number,
): readonly DOMRect[] =>
  Array.from({ length: Math.max(0, end - start) }, (_, index) => {
    const offset = start + index;
    return textRangeBounds(root, offset, offset + 1) ?? caretBounds(root, offset)
      ?? new DOMRect();
  });

const textRangeBounds = (
  root: HTMLElement,
  start: number,
  end: number,
): DOMRect | undefined => {
  const first = textPointAtOffset(root, start);
  const last = textPointAtOffset(root, end);
  if (first === undefined || last === undefined) return undefined;
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  const bounds = range.getBoundingClientRect();
  return bounds.width > 0 || bounds.height > 0 ? bounds : undefined;
};

const textPointAtOffset = (root: HTMLElement, target: number): TextPoint | undefined => {
  if (!Number.isSafeInteger(target) || target < 0) return undefined;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    if (target <= traversed + length) return { node, offset: target - traversed };
    traversed += length;
  }
  return target === 0 ? { node: root, offset: 0 } : undefined;
};

const offsetWithin = (
  root: HTMLElement,
  node: Node,
  offset: number,
): number | undefined => {
  if (node !== root && !root.contains(node)) return undefined;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
  } catch {
    return undefined;
  }
  return Math.min(range.toString().length, root.textContent?.length ?? 0);
};
