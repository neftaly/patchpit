import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useAnimationFrameScheduler } from './animation-frame.js'
import type { TerminalViewportSettings } from './settings.js'
import {
  equalVisibleRanges,
  initialFollowVisibleRange,
  isNearBottom,
  rangeContainsRow,
  visibleRangeForScroll,
} from './viewport-range.js'
import type { VisibleRange } from './viewport-range.js'

export type TerminalViewportController = {
  followPrompt: () => void
  handleScroll: () => void
  isPromptVisible: boolean
  noteSubmit: () => void
  promptRowIndex: number
  scrollRef: RefObject<HTMLDivElement>
  totalRows: number
  visibleRange: VisibleRange
}

export function useTerminalViewportController({
  lineCount,
  settings,
}: {
  lineCount: number
  settings: TerminalViewportSettings
}): TerminalViewportController {
  const totalRows = lineCount + 1
  const [visibleRange, setVisibleRange] = useState<VisibleRange>(() =>
    initialFollowVisibleRange(totalRows, settings),
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldScrollToBottom = useRef(true)
  const scheduleUpdate = useAnimationFrameScheduler()
  const promptRowIndex = lineCount
  const isPromptVisible = rangeContainsRow(visibleRange, promptRowIndex)

  const updateVisibleRange = useCallback(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    setVisibleRangeFromScroll(
      scrollElement,
      totalRows,
      settings,
      setVisibleRange,
    )
  }, [settings, totalRows])

  const updateAfterScroll = useCallback(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    shouldScrollToBottom.current = isNearBottom(
      scrollElement,
      settings.bottomStickPx,
    )
    setVisibleRangeFromScroll(
      scrollElement,
      totalRows,
      settings,
      setVisibleRange,
    )
  }, [settings, totalRows])

  const scheduleVisibleRangeUpdate = useCallback(() => {
    scheduleUpdate(updateVisibleRange)
  }, [scheduleUpdate, updateVisibleRange])

  const followPrompt = useCallback(() => {
    shouldScrollToBottom.current = true
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    updateVisibleRange()
  }, [updateVisibleRange])

  const handleScroll = useCallback(() => {
    scheduleUpdate(updateAfterScroll)
  }, [scheduleUpdate, updateAfterScroll])

  const noteSubmit = useCallback(() => {
    const scrollElement = scrollRef.current
    shouldScrollToBottom.current =
      !scrollElement || isNearBottom(scrollElement, settings.bottomStickPx)
  }, [settings.bottomStickPx])

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return
    if (shouldScrollToBottom.current) {
      scrollElement.scrollTop = scrollElement.scrollHeight
      shouldScrollToBottom.current = false
    }
    updateVisibleRange()
  }, [lineCount, updateVisibleRange])

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(scheduleVisibleRangeUpdate)
    observer.observe(scrollElement)
    return () => observer.disconnect()
  }, [scheduleVisibleRangeUpdate])

  return {
    followPrompt,
    handleScroll,
    isPromptVisible,
    noteSubmit,
    promptRowIndex,
    scrollRef,
    totalRows,
    visibleRange,
  }
}

function setVisibleRangeFromScroll(
  scrollElement: HTMLElement,
  totalRows: number,
  settings: TerminalViewportSettings,
  setVisibleRange: (updater: (current: VisibleRange) => VisibleRange) => void,
) {
  const nextRange = visibleRangeForScroll(scrollElement, totalRows, settings)
  setVisibleRange((current) =>
    equalVisibleRanges(current, nextRange) ? current : nextRange,
  )
}
