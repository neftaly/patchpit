import { fsTreeFromFiles, type FsTree } from '@patchpit/fs/tree';

export type AutomergeFsFile = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly path: readonly string[];
  readonly src: string;
};

export type AutomergeFileContentDoc = {
  readonly kind: 'patchpit.file-content@1';
  readonly contentType: string;
  readonly bytes: Uint8Array;
};

export type AutomergeFsFolderDoc = {
  readonly kind: 'patchpit.fs-folder@1';
  readonly tree: FsTree;
};

export type AutomergeFsPackage = {
  readonly files: readonly (readonly [src: string, doc: AutomergeFileContentDoc])[];
  readonly folder: AutomergeFsFolderDoc;
};

export const automergeFsPackageFromFiles = (files: readonly AutomergeFsFile[]): AutomergeFsPackage => ({
  files: files.map((file) => [file.src, {
    bytes: file.bytes.slice(),
    contentType: file.contentType,
    kind: 'patchpit.file-content@1',
  }] as const),
  folder: {
    kind: 'patchpit.fs-folder@1',
    tree: fsTreeFromFiles(files),
  },
});
