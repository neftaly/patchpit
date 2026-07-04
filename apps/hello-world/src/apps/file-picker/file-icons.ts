import { automergeMapSource, defineAutomergeMapRelations } from '@tarstate/automerge';
import {
  defineSchema,
  from,
  relation,
  stringField,
} from '@tarstate/core';
import { evaluate } from '@tarstate/core/evaluate';
import type { FileType, FileTypesDoc } from '../../filesystem';

export type FileIcons = readonly FileType[];

const fileIconSchema = defineSchema({
  fileTypes: relation<FileType>({
    key: 'match',
    fields: {
      emoji: stringField(),
      match: stringField(),
    },
  }),
});
const fileIconRelations = defineAutomergeMapRelations<FileTypesDoc>()([
  { relation: fileIconSchema.fileTypes, path: ['fileTypes'] },
]);
const fileIconQuery = from(fileIconSchema.fileTypes);

export function fileIcons(doc: FileTypesDoc): FileIcons {
  const result = evaluate(
    automergeMapSource(doc, { relations: fileIconRelations }),
    fileIconQuery,
  );
  return result.diagnostics.length === 0 ? result.rows : [];
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
