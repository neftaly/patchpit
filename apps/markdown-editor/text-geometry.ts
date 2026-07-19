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
  const text = textLayer(root);
  if (text === undefined) return undefined;
  const position = document.caretPositionFromPoint?.(x, y);
  if (position !== undefined && position !== null) {
    return offsetWithin(text, position.offsetNode, position.offset);
  }
  const range = document.caretRangeFromPoint?.(x, y);
  return range === undefined || range === null
    ? undefined
    : offsetWithin(text, range.startContainer, range.startOffset);
};

export const caretBounds = (root: HTMLElement, offset: number): DOMRect | undefined => {
  const text = textLayer(root);
  if (text === undefined) return undefined;
  const point = textPointAtOffset(text, offset);
  if (point === undefined) return undefined;
  const range = root.ownerDocument.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const collapsed = range.getBoundingClientRect();
  if (collapsed.height > 0) return collapsed;
  const content = text.textContent ?? '';
  const next = offset < content.length
    ? textRangeBounds(text, offset, offset + 1)
    : undefined;
  if (next !== undefined) return caretRectangle(next.left, next.top, next.height, root);
  const previous = offset > 0
    ? textRangeBounds(text, offset - 1, offset)
    : undefined;
  if (previous !== undefined) {
    return content[offset - 1] === '\n'
      ? caretRectangle(text.getBoundingClientRect().left, previous.bottom, previous.height, root)
      : caretRectangle(previous.right, previous.top, previous.height, root);
  }
  const empty = text.getBoundingClientRect();
  return caretRectangle(empty.left, empty.top, 0, root);
};

export const characterBounds = (
  root: HTMLElement,
  start: number,
  end: number,
): readonly DOMRect[] => {
  const text = textLayer(root);
  return Array.from({ length: Math.max(0, end - start) }, (_, index) => {
    const offset = start + index;
    return (text === undefined ? undefined : textRangeBounds(text, offset, offset + 1))
      ?? caretBounds(root, offset)
      ?? new DOMRect();
  });
};

export const textSelectionBounds = (
  root: HTMLElement,
  start: number,
  end: number,
): readonly DOMRect[] => {
  const text = textLayer(root);
  if (text === undefined) return [];
  const first = textPointAtOffset(text, start);
  const last = textPointAtOffset(text, end);
  if (first === undefined || last === undefined) return [];
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  return [...range.getClientRects()].filter(({ height, width }) => height > 0 && width > 0);
};

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

const textLayer = (root: HTMLElement): HTMLElement | undefined =>
  root.querySelector<HTMLElement>('.editor-text') ?? undefined;

const caretRectangle = (left: number, top: number, measuredHeight: number, root: HTMLElement) => {
  const lineHeight = Number.parseFloat(root.ownerDocument.defaultView?.getComputedStyle(root).lineHeight ?? '');
  const height = measuredHeight > 0 ? measuredHeight : Number.isFinite(lineHeight) ? lineHeight : 16;
  return new DOMRect(left, top, 0, height);
};
