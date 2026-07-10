import { fileURLToPath } from 'node:url';
import { createSandboxUrlMountFromFsFiles } from '@patchpit/sandbox-fs';
import { readSandboxFsDirectory } from '@patchpit/sandbox-fs/node';
import { sandboxCompatApp } from './app.ts';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const appFilesRoot = appPath('files');
const { id: sandboxCompatId } = sandboxCompatApp;

export const sandboxCompatPathPrefix = `/__patchpit/sandbox/${sandboxCompatId}/`;

export const readSandboxCompatFiles = () => readSandboxFsDirectory(appFilesRoot);

export const createSandboxCompatMount = async (baseUrl: string | URL) =>
  createSandboxUrlMountFromFsFiles(await readSandboxCompatFiles(), {
    baseUrl,
    entry: sandboxCompatApp.entry,
    mountId: sandboxCompatId,
  });
