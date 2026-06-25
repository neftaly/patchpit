import { createFilesystemDemoState } from './repo.js'
import type { FilesystemDemoState } from './repo.js'

let demoState: FilesystemDemoState | null = null

export function getFilesystemDemoState(): FilesystemDemoState {
  demoState ??= createFilesystemDemoState()
  return demoState
}
