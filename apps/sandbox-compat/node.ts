import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSandboxUrlMountFromFsFiles } from '@patchpit/sandbox-fs';
import { readSandboxFsDirectory } from '@patchpit/sandbox-fs/node';
import { sandboxCompatApp } from './app.ts';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const appFilesRoot = appPath('files');
const ghostscriptTigerFile = appPath('url-backed-files/Ghostscript_Tiger.svg');
const ghostscriptTigerSrc = 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg';
const { id: sandboxCompatId } = sandboxCompatApp;

export const sandboxCompatPathPrefix = `/__patchpit/sandbox/${sandboxCompatApp.id}/`;

export const sandboxCompatFiles = async () => {
  const files = [
    ...await readSandboxFsDirectory(appFilesRoot, {
      src: (path) => `automerge:${sandboxCompatId}/${path.join('/')}`,
    }),
    {
      body: await readFile(ghostscriptTigerFile),
      contentType: 'image/svg+xml',
      path: ['ghostscript-tiger.svg'],
      src: ghostscriptTigerSrc,
    },
  ];
  return files.sort((left, right) => left.path.join('/').localeCompare(right.path.join('/')));
};

export const sandboxCompatMount = async (baseUrl: string | URL) =>
  createSandboxUrlMountFromFsFiles(await sandboxCompatFiles(), {
    baseUrl,
    entry: sandboxCompatApp.entry,
    mountId: sandboxCompatId,
  });
