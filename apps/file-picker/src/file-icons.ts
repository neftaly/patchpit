import type { FileType, FileTypesDoc } from '@patchpit/system';

export type FileIcons = readonly FileType[];

export function fileIcons(doc: FileTypesDoc): FileIcons {
  return Array.isArray(doc.fileTypes)
    ? doc.fileTypes.filter(isFileType).map((fileType) => ({ ...fileType }))
    : [];
}

export function folderIcon(isOpen: boolean): string {
  return isOpen ? '📂' : '📁';
}

export function fileIcon(fileTypes: FileIcons, mimeType: string): string | undefined {
  const normalized = normalizeMimeType(mimeType);
  return fileTypes.find((fileType) => matchesMime(fileType.match, normalized))?.emoji;
}

function matchesMime(pattern: string, mimeType: string): boolean {
  const normalizedPattern = pattern.trim().toLowerCase();
  if (normalizedPattern === mimeType) return true;
  const parts = normalizedPattern.split('*');
  if (parts.length === 1 || !mimeType.startsWith(parts[0] ?? '')) return false;

  let index = parts[0]?.length ?? 0;
  for (const part of parts.slice(1)) {
    if (part === '') continue;
    const nextIndex = mimeType.indexOf(part, index);
    if (nextIndex === -1) return false;
    index = nextIndex + part.length;
  }
  const last = parts.at(-1) ?? '';
  return last === '' || mimeType.endsWith(last);
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function isFileType(value: unknown): value is FileType {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Partial<FileType>).emoji === 'string'
    && typeof (value as Partial<FileType>).match === 'string'
  );
}
