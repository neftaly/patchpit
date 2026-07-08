// Generates an Automerge folder fixture plus browser-importable doc assets.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import {
  assetRoot,
  distRoot,
  folderAssetPath,
  outputPath,
  urlBackedFixtures,
} from './hello-world-fixtures/config.mjs';
import { automergeFixtureAssets, sameContentDoc, sameFolderDoc } from './hello-world-fixtures/automerge-docs.mjs';
import { distFiles, urlBackedFixtureFiles } from './hello-world-fixtures/files.mjs';
import { generatedModule } from './hello-world-fixtures/generated-module.mjs';
import { relativePath, sameBytes } from './hello-world-fixtures/paths.mjs';

const check = process.argv.includes('--check');
const readOptionalBytes = (path) => readFile(path).catch((error) => {
  if (error && error.code === 'ENOENT') return undefined;
  throw error;
});

const distAssets = await distFiles(distRoot);
const urlAssets = await urlBackedFixtureFiles(urlBackedFixtures);
const automergeAssets = await automergeFixtureAssets(distAssets, urlAssets, readOptionalBytes);
const moduleText = generatedModule(automergeAssets.contentDocs, urlAssets);

if (check) {
  await checkGeneratedText(outputPath, moduleText);
  await checkGeneratedBytes(folderAssetPath, automergeAssets.folder.bytes, (bytes) =>
    sameFolderDoc(bytes, automergeAssets.folder.tree));
  await Promise.all(automergeAssets.contentDocs.map((asset) =>
    checkGeneratedBytes(asset.assetPath, asset.bytes, (bytes) => sameContentDoc(bytes, asset))));
  await Promise.all(urlAssets.map((asset) =>
    checkGeneratedBytes(asset.assetPath, asset.bytes, (bytes) => sameBytes(bytes, asset.bytes))));
  await checkUnexpectedAssets([
    folderAssetPath,
    ...automergeAssets.contentDocs.map((asset) => asset.assetPath),
    ...urlAssets.map((asset) => asset.assetPath),
  ]);
} else {
  await Promise.all([
    rm(assetRoot, { force: true, recursive: true }),
    rm(outputPath, { force: true }),
  ]);
  await mkdir(assetRoot, { recursive: true });
  await Promise.all([
    writeFile(outputPath, moduleText, 'utf8'),
    writeFile(folderAssetPath, automergeAssets.folder.bytes),
    ...automergeAssets.contentDocs.map((asset) => writeFile(asset.assetPath, asset.bytes)),
    ...urlAssets.map((asset) => writeFile(asset.assetPath, asset.bytes)),
  ]);
}

async function checkGeneratedText(path, expected) {
  const current = await readFile(path, 'utf8').catch((error) => {
    if (error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (current !== expected) markStale(path);
}

async function checkGeneratedBytes(path, expected, same) {
  const current = await readOptionalBytes(path);
  if (current === undefined || !same(current, expected)) markStale(path);
}

async function checkUnexpectedAssets(expectedAssets) {
  const expected = new Set(expectedAssets);
  const entries = await readdir(assetRoot).catch((error) => {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    const path = `${assetRoot}/${entry}`;
    if (!expected.has(path)) markStale(path);
  }
}

function markStale(path) {
  console.error(`${relativePath(path)} is stale. Run: pnpm generate:hello-world-fixtures`);
  process.exitCode = 1;
}
