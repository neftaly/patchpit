import { fileURLToPath } from 'node:url';
import { createSandboxUrlMount } from '@patchpit/sandbox';
import { readSandboxFsDirectory } from '@patchpit/sandbox-fs/node';
import { build } from 'vite';
import { sandboxCompatApp } from './app.ts';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const appBuildRoot = appPath('dist');
const { id: sandboxCompatId } = sandboxCompatApp;
let buildSnapshot: ReturnType<typeof packageSandboxCompatBuild> | undefined;

export const readSandboxCompatBundle = () => buildSnapshot ??= packageSandboxCompatBuild();

export const readSandboxCompatFiles = async () => (await readSandboxCompatBundle()).files;

export const createSandboxCompatMount = async (baseUrl: string | URL) =>
  createSandboxUrlMount({
    baseUrl,
    entry: sandboxCompatApp.entry,
    files: (await readSandboxCompatFiles()).map((file) => ({
      path: file.path,
      read: () => ({ body: file.body, contentType: file.contentType }),
    })),
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
      resourceRef: `sandbox-compat:${name}`,
    };
  });
  const files = output.map(({ body, contentType, path }) => ({ body, contentType, path }));
  return { files, packageFiles };
}
