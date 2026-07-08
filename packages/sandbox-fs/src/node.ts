import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

type SandboxFsDirectoryFile = {
  readonly body: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
  readonly path: readonly string[];
  readonly src: string;
};

type ReadSandboxFsDirectoryOptions = {
  readonly src: (path: readonly string[]) => string;
};

export const readSandboxFsDirectory = async (
  root: string,
  options: ReadSandboxFsDirectoryOptions,
): Promise<readonly SandboxFsDirectoryFile[]> =>
  readSandboxFsDirectoryEntries(root, options, root);

const readSandboxFsDirectoryEntries = async (
  root: string,
  options: ReadSandboxFsDirectoryOptions,
  dir: string,
): Promise<readonly SandboxFsDirectoryFile[]> =>
  (await Promise.all((await sortedDirectoryEntries(dir)).map(async (entry) => {
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) return readSandboxFsDirectoryEntries(root, options, file);
    if (!entry.isFile()) throw new Error(`Unsupported sandbox filesystem entry: ${file}`);
    const path = relative(root, file).split(sep);
    const body: Uint8Array<ArrayBuffer> = new Uint8Array(await readFile(file));
    return [{
      body,
      contentType: contentType(file),
      path,
      src: options.src(path),
    }];
  }))).flat();

const sortedDirectoryEntries = async (dir: string) =>
  [...await readdir(dir, { withFileTypes: true })]
    .sort((left, right) => left.name.localeCompare(right.name));

function contentType(path: string) {
  return {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
  }[extname(path)] ?? 'application/octet-stream';
}
