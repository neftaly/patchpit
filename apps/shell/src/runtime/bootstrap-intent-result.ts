import {
  runtimeError,
  type IntentResult,
  type Json,
  type RuntimeError,
} from '@patchpit/system/runtime';

export function rejected(error: RuntimeError): IntentResult {
  return { status: 'rejected', error };
}

export function badRequest(error: Error | string): RuntimeError {
  return runtimeError('bad_request', typeof error === 'string' ? error : error.message);
}

export function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sameHeadSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightHeads = new Set(right);
  return left.every((head) => rightHeads.has(head));
}

export function isRuntimeError(value: unknown): value is RuntimeError {
  return isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string';
}

export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

export function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isRecord(value: unknown): value is Readonly<Record<string, Json | undefined>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
