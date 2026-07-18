import { readdir, readFile } from 'node:fs/promises';
import { build } from 'vite';

const contentTypes: Readonly<Record<string, string>> = {
  css: 'text/css',
  html: 'text/html',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  svg: 'image/svg+xml',
};

export type PackageFile = {
  readonly bytes: Uint8Array;
  readonly contentType?: string;
  readonly name: string;
  readonly order: number;
};

export const readFlatAppBundle = async (options: {
  readonly configFile: string;
  readonly publicDirectory?: string;
}) => {
  const built = await build({
    configFile: options.configFile,
    logLevel: 'silent',
    mode: 'production',
    build: { write: false },
  });
  if ('on' in built) throw new Error('App build unexpectedly entered watch mode');
  const output = (Array.isArray(built) ? built : [built])
    .flatMap((result) => result.output)
    .map((entry) => ({
      name: entry.fileName,
      source: entry.type === 'chunk' ? entry.code : entry.source,
    }));
  const publicFiles = options.publicDirectory === undefined
    ? []
    : await readPublicFiles(options.publicDirectory);
  const files = [...output, ...publicFiles]
    .sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(files.map(({ name }) => name)).size !== files.length) {
    throw new Error('App build output contains duplicate files');
  }
  const packageFiles = files.map(({ name, source }, order): PackageFile => {
    if (name.includes('/')) throw new Error(`App build output must be flat: ${name}`);
    const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
    return {
      bytes: typeof source === 'string' ? new TextEncoder().encode(source) : new Uint8Array(source),
      ...(contentTypes[extension] === undefined ? {} : { contentType: contentTypes[extension] }),
      name,
      order,
    };
  });
  return { packageFiles };
};

const readPublicFiles = async (directory: string) => Promise.all(
  (await readdir(directory, { withFileTypes: true })).map(async (entry) => {
    if (!entry.isFile()) throw new Error(`App public files must be flat: ${entry.name}`);
    return { name: entry.name, source: new Uint8Array(await readFile(`${directory}/${entry.name}`)) };
  }),
);
