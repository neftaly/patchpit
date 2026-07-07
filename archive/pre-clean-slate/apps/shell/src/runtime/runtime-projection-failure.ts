import type { RuntimeError } from '@patchpit/system/runtime';
import { detailFromUnknown, metadataDetails } from './runtime-error-details';

export type RuntimeProjectionFailure = {
  readonly title: string;
  readonly message: string;
  readonly details: readonly string[];
};

export function runtimeProjectionFailureFromRuntimeError(
  error: RuntimeError,
  fallbackTitle = 'Filesystem projection unavailable',
): RuntimeProjectionFailure {
  return {
    title: projectionFailureTitle(error, fallbackTitle),
    message: error.message,
    details: [
      `code: ${error.code}`,
      ...(error.reason === undefined ? [] : [`reason: ${error.reason}`]),
      ...metadataDetails(error.metadata),
    ],
  };
}

export function runtimeProjectionFailureFromUnknownError(
  error: unknown,
  fallbackMessage = 'Filesystem projection subscription failed.',
): RuntimeProjectionFailure {
  return {
    title: 'Projection unavailable',
    message: error instanceof Error ? error.message : fallbackMessage,
    details: detailFromUnknown(error),
  };
}

function projectionFailureTitle(error: RuntimeError, fallbackTitle: string): string {
  if (error.code === 'unknown_projection') return 'Projection unavailable';
  if (error.code === 'schema_mismatch') return 'Projection schema mismatch';
  if (error.code === 'unsupported_basis') return 'Projection basis unavailable';
  if (error.code === 'runtime_unavailable') return 'Runtime unavailable';
  if (error.code === 'policy_denied') return 'Projection denied by policy';
  if (error.code === 'policy_quarantined') return 'Projection quarantined by policy';
  return fallbackTitle;
}
