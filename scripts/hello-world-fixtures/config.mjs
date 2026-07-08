import { resolve } from 'node:path';

export const distRoot = resolve('apps/hello-world/dist');
export const generatedRoot = resolve('src/generated');
export const outputPath = resolve(generatedRoot, 'hello-world-dist.ts');
export const assetRoot = resolve(generatedRoot, 'hello-world-dist');
export const folderAssetPath = resolve(assetRoot, 'folder.automerge');

export const urlBackedFixtures = [
  {
    fixturePath: resolve('scripts/fixtures/Ghostscript_Tiger.svg'),
    metadataPath: resolve('scripts/fixtures/Ghostscript_Tiger.svg.meta.json'),
    path: 'ghostscript-tiger.svg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
  },
];
