import {
  createSandboxUrlMount,
  type SandboxDocumentBody,
  type SandboxDocumentPath,
  type SandboxUrlMount,
} from '@patchpit/sandbox';

export type SandboxFsFile = {
  readonly body: SandboxDocumentBody;
  readonly contentType?: string;
  readonly path: SandboxDocumentPath;
};

export type CreateSandboxUrlMountFromFsFilesOptions = {
  readonly baseUrl: string | URL;
  readonly entry: SandboxDocumentPath;
  readonly mountId?: string;
  readonly route?: readonly string[];
};

export const createSandboxUrlMountFromFsFiles = <const File extends SandboxFsFile>(
  files: readonly File[],
  options: CreateSandboxUrlMountFromFsFilesOptions,
): SandboxUrlMount =>
  createSandboxUrlMount({
    ...options,
    files: files.map((file) => ({
      path: file.path,
      read: () => file.contentType === undefined
        ? { body: file.body }
        : { body: file.body, contentType: file.contentType },
    })),
  });
