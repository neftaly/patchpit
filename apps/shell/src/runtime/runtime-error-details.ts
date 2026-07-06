import type { RuntimeError } from '@patchpit/system/runtime';

export function detailFromUnknown(value: unknown): readonly string[] {
  if (value === undefined || value instanceof Error) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return [String(value)];
  }
  try {
    const json = JSON.stringify(value);
    return json === undefined ? [] : [json];
  } catch {
    return [Object.prototype.toString.call(value)];
  }
}

export function metadataDetails(metadata: RuntimeError['metadata']): readonly string[] {
  if (metadata === undefined) return [];
  return Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
}
