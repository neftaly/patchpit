import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSandboxUrlMountFromFsFiles } from '@patchpit/sandbox-fs';
import { readSandboxFsDirectory } from '@patchpit/sandbox-fs/node';
import { sandboxCompatApp } from './app.ts';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const appFilesRoot = appPath('files');
const ghostscriptTigerFile = appPath('url-backed-files/Ghostscript_Tiger.svg');
const { id: sandboxCompatId } = sandboxCompatApp;

export const sandboxCompatPathPrefix = `/__patchpit/sandbox/${sandboxCompatId}/`;

export const sandboxCompatFiles = async () =>
  [
    ...await readSandboxFsDirectory(appFilesRoot),
    {
      body: await readFile(ghostscriptTigerFile),
      contentType: 'image/svg+xml',
      path: ['ghostscript-tiger.svg'],
    },
  ];

export const sandboxCompatMount = async (baseUrl: string | URL) =>
  createSandboxUrlMountFromFsFiles(await sandboxCompatFiles(), {
    baseUrl,
    entry: sandboxCompatApp.entry,
    mountId: sandboxCompatId,
  });
