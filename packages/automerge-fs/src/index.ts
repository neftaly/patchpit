import type { FsTree } from '@patchpit/fs';

export type AutomergeFileContentDoc = {
  readonly kind: 'patchpit.file-content@1';
  readonly contentType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
};

export type AutomergeFsFolderDoc = {
  readonly kind: 'patchpit.fs-folder@1';
  readonly tree: FsTree;
};
