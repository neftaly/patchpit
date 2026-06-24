import { useCallback, useRef } from 'react'
import type { FormEvent, RefObject } from 'react'

export type TerminalInputController = {
  inputRef: RefObject<HTMLInputElement>
  submit: (event: FormEvent) => void
}

export function useTerminalInput({
  beforeSubmit,
  onCommand,
}: {
  beforeSubmit?: () => void
  onCommand: (command: string) => void | Promise<void>
}): TerminalInputController {
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      const commandInput = inputRef.current
      if (!commandInput) return

      beforeSubmit?.()
      const command = commandInput.value.trim()
      commandInput.value = ''
      void onCommand(command)
    },
    [beforeSubmit, onCommand],
  )

  return { inputRef, submit }
}
