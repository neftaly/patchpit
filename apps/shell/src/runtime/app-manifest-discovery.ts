import {
  PatchpitType,
  type AppManifestDoc,
} from '@patchpit/system';

const appManifestEntryKinds = new Set<unknown>(['module', 'html']);

export function isPackageAppManifestDoc(value: unknown): value is AppManifestDoc {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as { '@patchpit'?: { type?: unknown } })['@patchpit']?.type === PatchpitType.AppManifest
    && (value as { manifestVersion?: unknown }).manifestVersion === 1
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { name?: unknown }).name === 'string'
    && typeof (value as { entry?: unknown }).entry === 'string'
    && appManifestEntryKinds.has((value as { entryKind?: unknown }).entryKind)
    && typeof (value as { version?: unknown }).version === 'string'
  );
}
