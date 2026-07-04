import wasmUrl from '@automerge/automerge/automerge.wasm?url';
import {
  initializeWasm,
  isWasmInitialized,
  wasmInitialized,
} from '@automerge/automerge/slim';

export * from '@automerge/automerge/slim';

const ready = isWasmInitialized() ? wasmInitialized() : initializeWasm(wasmUrl);

export function initializeAutomerge(): Promise<void> {
  return ready;
}
