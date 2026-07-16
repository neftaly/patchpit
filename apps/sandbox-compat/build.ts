import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const contentTypes: Readonly<Record<string, string>> = {
  css: 'text/css',
  html: 'text/html',
  js: 'text/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
};
let bundle: Promise<{ readonly packageFiles: readonly PackageFile[] }> | undefined;

type PackageFile = {
  readonly bytes: Uint8Array;
  readonly contentType?: string;
  readonly name: string;
  readonly order: number;
};

export const readSandboxCompatBundle = () => bundle ??= buildSandboxCompatBundle();

const buildSandboxCompatBundle = async () => {
  await build({ configFile: appPath('vite.config.ts'), logLevel: 'silent' });
  const entries = (await readdir(appPath('dist'), { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const packageFiles = await Promise.all(entries.map(async (entry, order): Promise<PackageFile> => {
    if (!entry.isFile()) throw new Error(`Sandbox compat build output must be flat: ${entry.name}`);
    const extension = entry.name.split('.').at(-1)?.toLowerCase() ?? '';
    return {
      bytes: new Uint8Array(await readFile(appPath(`dist/${entry.name}`))),
      ...(contentTypes[extension] === undefined ? {} : { contentType: contentTypes[extension] }),
      name: entry.name,
      order,
    };
  }));
  return { packageFiles };
};
