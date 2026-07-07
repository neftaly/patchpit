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
import { automergeHeadSetForHandle } from './automerge-heads';

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
  if (row.selectedUrls !== undefined && !isStringArray(row.selectedUrls)) {
    return badRequest('File picker request selectedUrls must be an array of strings.');
  }
  if (row.selectedUrls !== undefined && row.toggle !== undefined) {
    return badRequest('File picker request selectedUrls and toggle are mutually exclusive.');
  }
  if (
    intent === filePickerToggleFolderIntent
    && (row.selectedUrls !== undefined || row.toggle !== undefined)
  ) {
    return badRequest(`${filePickerToggleFolderIntent} only accepts id and url.`);
  }

  return {
    id: row.id,
    url: row.url,
    ...(row.selectedUrls === undefined ? {} : { selectedUrls: row.selectedUrls }),
    ...(row.toggle === undefined ? {} : { toggle: row.toggle }),
  };
}

function filePickerSelectionOptions(row: FilePickerIntentRow): FileSelectionOptions | undefined {
  if (row.selectedUrls === undefined && row.toggle === undefined) return undefined;
  if (row.selectedUrls !== undefined) return { selectedUrls: row.selectedUrls };
  return row.toggle ? { toggle: true } : undefined;
}
