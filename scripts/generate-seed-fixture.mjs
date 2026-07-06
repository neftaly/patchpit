import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const seedFixturePath = 'packages/system/src/fixtures/seed.ts';

const fileTypes = [
  ['application/vnd.automerge', '🔀'],
  ['application/json', '🧾'],
  ['application/*+json', '🧾'],
  ['application/x-ndjson', '🧾'],
  ['application/javascript', '📜'],
  ['application/typescript', '📜'],
  ['text/css', '💅'],
  ['text/html', '🌐'],
  ['text/javascript', '📜'],
  ['text/typescript', '📜'],
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

const docsTree = await seedFolderFromDirectory('docs');

const tree = {
  kind: 'folder',
  name: '',
  children: [
    docsTree,
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

const fixtureSource = `export type SeedFileType = {
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

await mkdir(dirname(seedFixturePath), { recursive: true });
await writeFile(seedFixturePath, fixtureSource);

async function seedFolderFromDirectory(directoryPath) {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  const children = await Promise.all(
    directoryEntries
      .filter((directoryEntry) => !directoryEntry.name.startsWith('.'))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (directoryEntry) => {
        const childPath = join(directoryPath, directoryEntry.name);
        if (directoryEntry.isDirectory()) return seedFolderFromDirectory(childPath);
        return {
          kind: 'file',
          name: directoryEntry.name,
          content: await readFile(childPath, 'utf8'),
        };
      }),
  );
  return {
    kind: 'folder',
    name: basename(directoryPath),
    children,
  };
}
