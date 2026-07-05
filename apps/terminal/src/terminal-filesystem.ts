import type { IFileSystem } from 'just-bash/browser';

export type PatchpitFilesystem = {
  readonly cacheKey: string;
  close?(): void;
  readonly rootUrl: string;
  readonly openRoot: (rootUrl: string) => IFileSystem;
};
