import type { FileSelectionOptions } from '@patchpit/file-picker';
import {
  filePickerIntentSchemaId,
  filePickerRequestsRelation,
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  type FilePickerIntentRow,
  type IntentResult,
  type RuntimeClient,
  type TarstateRow,
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
  return runtime.submitIntent({
    intent,
    input: {
      schemaId: filePickerIntentSchemaId,
      relations: { [filePickerRequestsRelation]: [row as unknown as TarstateRow] },
    },
    idempotencyKey: row.id,
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
