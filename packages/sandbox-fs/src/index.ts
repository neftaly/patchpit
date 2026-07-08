import {
  createSandboxUrlMount,
  type SandboxDocumentBody,
  type SandboxDocumentPath,
  type SandboxUrlMount,
} from '@patchpit/sandbox';

export type SandboxFsFile = {
  readonly path: SandboxDocumentPath;
  readonly src: string;
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

export type SandboxFsFileWithContent = SandboxFsFile & SandboxFsFileContent;

export const createSandboxUrlMountFromFsFiles = (
  files: readonly SandboxFsFileWithContent[],
  options: CreateSandboxUrlMountFromFsFilesOptions,
): SandboxUrlMount =>
  createSandboxUrlMount({
    baseUrl: options.baseUrl,
    entry: options.entry,
    files: files.map((file) => ({ path: file.path, read: () => file })),
    ...(options.mountId === undefined ? {} : { mountId: options.mountId }),
    ...(options.route === undefined ? {} : { route: options.route }),
  });
