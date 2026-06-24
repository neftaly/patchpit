import { useCallback, useEffect, useRef } from 'react'

export function useAnimationFrameScheduler(): (update: () => void) => void {
  const scheduledUpdate = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (scheduledUpdate.current === null) return
      cancelAnimationFrame(scheduledUpdate.current)
    },
    [],
  )

  return useCallback((update: () => void) => {
    if (scheduledUpdate.current !== null) return
    scheduledUpdate.current = requestAnimationFrame(() => {
      scheduledUpdate.current = null
      update()
    })
  }, [])
}
