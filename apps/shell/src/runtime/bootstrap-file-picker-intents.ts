import type { FileSelectionOptions } from '@patchpit/file-picker/model';
import {
  selectFilePickerUrl,
  toggleFilePickerFolder,
} from '@patchpit/file-picker/state';
import {
  filePickerIntentBoundary,
  type SeedFilesystem,
} from '@patchpit/system';
import {
  automergeHeadSetForHandle,
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  runtimeIntentRequestRow,
  type FilePickerIntentRow,
  type IntentRequest,
  type IntentResult,
  type RuntimeError,
} from '@patchpit/system/runtime';
import {
  badRequest,
  isRuntimeError,
  isStringArray,
  rejected,
} from './bootstrap-intent-result';

export type FilePickerIntentName =
  | typeof filePickerSelectUrlIntent
  | typeof filePickerToggleFolderIntent;

export function submitBootstrapFilePickerIntent(
  seed: SeedFilesystem,
  request: IntentRequest,
): IntentResult | undefined {
  const intent = filePickerIntentName(request.intent);
  if (intent === undefined) return undefined;

  const filePickerRequest = filePickerIntentRequest(request, intent);
  if (isRuntimeError(filePickerRequest)) return rejected(filePickerRequest);

  if (intent === filePickerSelectUrlIntent) {
    selectFilePickerUrl(
      seed.filePickerStateHandle,
      filePickerRequest.url,
      filePickerSelectionOptions(filePickerRequest),
    );
  } else {
    toggleFilePickerFolder(seed.filePickerStateHandle, filePickerRequest.url);
  }

  return {
    status: 'committed',
    heads: automergeHeadSetForHandle(seed.filePickerStateHandle),
  };
}

function filePickerIntentName(intent: IntentRequest['intent']): FilePickerIntentName | undefined {
  return (
    intent === filePickerSelectUrlIntent
    || intent === filePickerToggleFolderIntent
  )
    ? intent
    : undefined;
}

function filePickerIntentRequest(
  request: IntentRequest,
  intent: FilePickerIntentName,
): FilePickerIntentRow | RuntimeError {
  const row = runtimeIntentRequestRow<FilePickerIntentRow>(request, filePickerIntentBoundary);
  if (isRuntimeError(row)) return row;
  if (row.range !== undefined && !isStringArray(row.range)) {
    return badRequest('File picker request range must be an array of strings.');
  }
  if (
    intent === filePickerToggleFolderIntent
    && (row.range !== undefined || row.toggle !== undefined)
  ) {
    return badRequest(`${filePickerToggleFolderIntent} only accepts id and url.`);
  }

  return {
    id: row.id,
    url: row.url,
    ...(row.range === undefined ? {} : { range: row.range }),
    ...(row.toggle === undefined ? {} : { toggle: row.toggle }),
  };
}

function filePickerSelectionOptions(row: FilePickerIntentRow): FileSelectionOptions | undefined {
  if (row.range === undefined && row.toggle === undefined) return undefined;
  return {
    ...(row.range === undefined ? {} : { range: row.range }),
    ...(row.toggle === undefined ? {} : { toggle: row.toggle }),
  };
}
