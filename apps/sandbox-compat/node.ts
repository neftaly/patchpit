import { fileURLToPath } from 'node:url';
import { automergeFsPackageFromFiles, openAutomergeFsFolder } from '@patchpit/automerge-fs';
import { openFsEntries, type FsEntry } from '@patchpit/fs';
import { createSandboxUrlMountFromFsFiles, sandboxFsFilesFromEntries } from '@patchpit/sandbox-fs';
import { readSandboxFsDirectory } from '@patchpit/sandbox-fs/node';
import { build } from 'vite';
import { sandboxCompatApp } from './app.ts';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const appBuildRoot = appPath('dist');
const { id: sandboxCompatId } = sandboxCompatApp;
const ghostscriptTigerUrl = 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg';
let buildSnapshot: ReturnType<typeof packageSandboxCompatBuild> | undefined;

export const sandboxCompatPathPrefix = `/__patchpit/sandbox/${sandboxCompatId}/`;

export const readSandboxCompatBundle = () => buildSnapshot ??= packageSandboxCompatBuild();

export const readSandboxCompatFiles = async () => (await readSandboxCompatBundle()).files;

export const createSandboxCompatMount = async (baseUrl: string | URL) =>
  createSandboxUrlMountFromFsFiles(await readSandboxCompatFiles(), {
    baseUrl,
    entry: sandboxCompatApp.entry,
    mountId: sandboxCompatId,
  });

async function packageSandboxCompatBuild() {
  await build({ configFile: appPath('vite.config.ts'), logLevel: 'silent' });
  const output = await readSandboxFsDirectory(appBuildRoot);
  const packageFiles = output.map((file, order) => {
    if (file.path.length !== 1 || file.path[0] === undefined) {
      throw new Error(`Sandbox compat build output must be flat: ${file.path.join('/')}`);
    }
    const name = file.path[0];
    return {
      bytes: file.body,
      contentType: file.contentType,
      entryId: name,
      name,
      order,
      parentId: null,
      resourceRef: name === 'ghostscript-tiger.svg' ? ghostscriptTigerUrl : `sandbox-compat:${name}`,
    };
  });
  const packaged = automergeFsPackageFromFiles(packageFiles);
  const folder = openAutomergeFsFolder(sandboxCompatId, packaged.folder);
  const filesystem = openFsEntries([folder.attachment]);
  try {
    const snapshot = filesystem.observer.getSnapshot();
    if (snapshot.state !== 'open') throw new Error('Sandbox compat filesystem did not open');
    const entries: readonly FsEntry[] = snapshot.current.rows.map(({ sourceId: _sourceId, ...entry }) => entry);
    const contentByRef = new Map(packageFiles.map(({ bytes, contentType, resourceRef }) => [
      resourceRef,
      { bytes, ...(contentType === undefined ? {} : { contentType }) },
    ] as const));
    const files = await sandboxFsFilesFromEntries(entries, (resourceRef) => {
      const content = contentByRef.get(resourceRef);
      return content === undefined ? undefined : {
        body: content.bytes,
        ...(content.contentType === undefined ? {} : { contentType: content.contentType }),
      };
    });
    return { entries, files, packageFiles };
  } finally {
    filesystem.close();
  }
}
