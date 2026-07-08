import {
  createSandboxUrlMount,
  type SandboxDocumentBody,
  type SandboxDocumentPath,
  type SandboxUrlMount,
} from '@patchpit/sandbox';

export type SandboxFsFile = {
  readonly path: SandboxDocumentPath;
};

export type SandboxFsFileContent = {
  readonly body: SandboxDocumentBody;
  readonly contentType?: string;
};

export type CreateSandboxUrlMountFromFsFilesOptions = {
  readonly baseUrl: string | URL;
  readonly entry: readonly string[];
  readonly mountId?: string;
  readonly route?: readonly string[];
};

export const createSandboxUrlMountFromFsFiles = <
  const File extends SandboxFsFile & SandboxFsFileContent,
>(
  files: readonly File[],
  options: CreateSandboxUrlMountFromFsFilesOptions,
): SandboxUrlMount =>
  createSandboxUrlMount({
    baseUrl: options.baseUrl,
    entry: options.entry,
    files: files.map((file) => ({
      path: file.path,
      read: () => file.contentType === undefined
        ? { body: file.body }
        : { body: file.body, contentType: file.contentType },
    })),
    ...(options.mountId === undefined ? {} : { mountId: options.mountId }),
    ...(options.route === undefined ? {} : { route: options.route }),
  });
