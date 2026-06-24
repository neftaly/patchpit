import type { TerminalViewportSettings } from './settings.js'

export type VisibleRange = {
  start: number
  end: number
}

export type VisibleRangeItem<T> = {
  index: number
  item: T
}

export function distanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight
}

export function equalVisibleRanges(
  left: VisibleRange,
  right: VisibleRange,
): boolean {
  return left.start === right.start && left.end === right.end
}

export function isNearBottom(
  element: HTMLElement,
  thresholdPx: number,
): boolean {
  return distanceFromBottom(element) <= thresholdPx
}

export function rangeContainsRow(range: VisibleRange, row: number): boolean {
  return range.start <= row && range.end > row
}

export function visibleItemsForRange<T>(
  itemAt: (index: number) => T | undefined,
  itemCount: number,
  range: VisibleRange,
): readonly VisibleRangeItem<T>[] {
  const items: VisibleRangeItem<T>[] = []
  for (
    let index = range.start;
    index < Math.min(range.end, itemCount);
    index += 1
  ) {
    const item = itemAt(index)
    if (item) items.push({ index, item })
  }
  return items
}

export function initialFollowVisibleRange(
  totalRows: number,
  settings: TerminalViewportSettings,
): VisibleRange {
  return {
    start: Math.max(
      0,
      totalRows - settings.initialVisibleRows - settings.overscanRows,
    ),
    end: totalRows,
  }
}

export function visibleRangeForScroll(
  scrollElement: HTMLElement,
  totalRows: number,
  settings: TerminalViewportSettings,
): VisibleRange {
  const firstVisibleRow = Math.floor(
    scrollElement.scrollTop / settings.rowHeightPx,
  )
  const visibleRowCount = Math.ceil(
    scrollElement.clientHeight / settings.rowHeightPx,
  )
  const start = Math.max(0, firstVisibleRow - settings.overscanRows)
  const end = Math.min(
    totalRows,
    firstVisibleRow + visibleRowCount + settings.overscanRows,
  )
  return { start, end }
}
