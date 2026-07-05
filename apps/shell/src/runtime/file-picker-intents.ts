import type { FileSelectionOptions } from '@patchpit/file-picker/model';
import { filePickerIntentBoundary } from '@patchpit/system';
import {
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  submitRuntimeIntent,
  type FilePickerIntentRow,
  type IntentResult,
  type RuntimeClient,
} from '@patchpit/system/runtime';

export type FilePickerIntentName =
  | typeof filePickerSelectUrlIntent
  | typeof filePickerToggleFolderIntent;

export type FilePickerSelectUrlInput = {
  readonly options?: FileSelectionOptions;
  readonly url: string;
};

export type FilePickerToggleFolderInput = {
  readonly url: string;
};

type FilePickerIntentInput = FilePickerSelectUrlInput | FilePickerToggleFolderInput;

let nextFilePickerRequestId = 1;

export function submitFilePickerIntent(
  runtime: RuntimeClient,
  intent: typeof filePickerSelectUrlIntent,
  input: FilePickerSelectUrlInput,
): Promise<IntentResult>;
export function submitFilePickerIntent(
  runtime: RuntimeClient,
  intent: typeof filePickerToggleFolderIntent,
  input: FilePickerToggleFolderInput,
): Promise<IntentResult>;
export function submitFilePickerIntent(
  runtime: RuntimeClient,
  intent: FilePickerIntentName,
  input: FilePickerIntentInput,
): Promise<IntentResult> {
  const row = filePickerIntentRow(input);
  return submitRuntimeIntent(runtime, {
    boundary: filePickerIntentBoundary,
    intent,
    idempotencyKey: row.id,
    row,
  });
}

function filePickerIntentRow(input: FilePickerIntentInput): FilePickerIntentRow {
  const options = 'options' in input ? input.options : undefined;

  return {
    id: `file-picker:${nextFilePickerRequestId++}`,
    url: input.url,
    ...(options?.range === undefined ? {} : { range: options.range }),
    ...(options?.toggle === undefined ? {} : { toggle: options.toggle }),
  };
}
