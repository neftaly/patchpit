import { BashTerminal } from '@patchpit/bash-terminal'
import type { BuiltinAppRenderContext } from '../builtin-app-registry.js'

export default function BashTerminalBuiltinApp({
  terminalFileSystem,
}: BuiltinAppRenderContext) {
  return <BashTerminal fileSystem={terminalFileSystem} />
}
