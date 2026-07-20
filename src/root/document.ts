import { getConflicts } from '@automerge/automerge';
import { adoptConflictFreeAutomergeJsonValue } from '@tarstate/automerge/values';
import {
  automergeFolderDocumentMetadata,
  createAutomergeFolderDocument,
  type AutomergeFolderDocument,
} from '@patchpit/automerge-fs';
import type { FolderLink } from '@patchpit/fs';

export const DEMO_BOOTSTRAP = { id: 'patchpit.demo', generation: 1 } as const;

export type RootDeclaration = {
  readonly format: 1;
  readonly bootstrap?: {
    readonly id: string;
    readonly generation: number;
  };
};

type RootDocumentMetadata = typeof automergeFolderDocumentMetadata & {
  readonly root: RootDeclaration;
};

export type AutomergeRootDocument = Omit<AutomergeFolderDocument, '@patchpit'> & {
  readonly '@patchpit': RootDocumentMetadata;
};

export const createAutomergeRootDocument = (
  title: string,
  links: readonly FolderLink[],
  bootstrap = DEMO_BOOTSTRAP,
): AutomergeRootDocument => {
  const folder = createAutomergeFolderDocument(title, links);
  return {
    ...folder,
    '@patchpit': {
      ...folder['@patchpit'],
      root: { format: 1, bootstrap },
    },
  };
};

export const readRootDeclaration = (
  document: AutomergeFolderDocument,
): { readonly state: 'absent' }
  | { readonly state: 'invalid' }
  | { readonly state: 'unsupported' }
  | { readonly state: 'ready'; readonly value: RootDeclaration } => {
  if (getConflicts(document, '@patchpit') !== undefined) return { state: 'invalid' };
  const metadata = adoptConflictFreeAutomergeJsonValue(document['@patchpit']);
  if (!metadata.success || !isRecord(metadata.value)) return { state: 'invalid' };
  const root = metadata.value.root;
  if (root === undefined) return { state: 'absent' };
  if (!isRecord(root) || !Number.isSafeInteger(root.format) || (root.format as number) < 1) {
    return { state: 'invalid' };
  }
  if (root.format !== 1) return { state: 'unsupported' };
  if (root.bootstrap === undefined) return { state: 'ready', value: { format: 1 } };
  if (!isRecord(root.bootstrap)
    || typeof root.bootstrap.id !== 'string'
    || !Number.isSafeInteger(root.bootstrap.generation)
    || (root.bootstrap.generation as number) < 1) return { state: 'invalid' };
  return {
    state: 'ready',
    value: {
      format: 1,
      bootstrap: {
        id: root.bootstrap.id,
        generation: root.bootstrap.generation as number,
      },
    },
  };
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
