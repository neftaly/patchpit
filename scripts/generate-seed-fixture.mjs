import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const target = 'apps/hello-world/src/fixtures/seed.ts';

const fileTypes = [
  ['application/vnd.automerge', '🔀'],
  ['application/json', '🧾'],
  ['application/*+json', '🧾'],
  ['application/x-ndjson', '🧾'],
  ['application/javascript', '💻'],
  ['application/typescript', '💻'],
  ['text/css', '💻'],
  ['text/html', '💻'],
  ['text/javascript', '💻'],
  ['text/typescript', '💻'],
  ['text/markdown', '📝'],
  ['text/plain', '📝'],
  ['model/*', '🧊'],
  ['application/pdf', '📕'],
  ['application/gzip', '🗜️'],
  ['application/x-tar', '🗜️'],
  ['application/zip', '🗜️'],
  ['audio/*', '🎵'],
  ['image/*', '🖼️'],
  ['video/*', '🎞️'],
  ['*/*', '📄'],
];

const tree = {
  kind: 'folder',
  name: '',
  children: [
    {
      kind: 'folder',
      name: 'home',
      children: [
        {
          kind: 'file',
          name: 'README.md',
          content: ['# Home', '', 'This is a tiny filesystem namespace fixture.'].join('\n'),
        },
        {
          kind: 'file',
          name: 'ghostscript-tiger.svg',
          url: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
        },
      ],
    },
  ],
};

const file = `export type SeedFileType = {
  emoji: string;
  match: string;
};

export type SeedFile = {
  kind: 'file';
  name: string;
  content?: string;
  url?: string;
};

export type SeedFolder = {
  kind: 'folder';
  name: string;
  children: readonly SeedNode[];
};

export type SeedNode = SeedFile | SeedFolder;

export const seedFileTypes = ${JSON.stringify(fileTypes.map(([match, emoji]) => ({ match, emoji })), null, 2)} as const satisfies readonly SeedFileType[];

export const seedTree = ${JSON.stringify(tree, null, 2)} as const satisfies SeedFolder;
`;

await mkdir(dirname(target), { recursive: true });
await writeFile(target, file);
