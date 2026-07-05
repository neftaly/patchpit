import type { IFileSystem } from 'just-bash/browser';

export type PatchpitFilesystem = {
  readonly cacheKey: string;
  readonly rootUrl: string;
  readonly openRoot: (rootUrl: string) => IFileSystem;
};
