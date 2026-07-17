import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TarstateParseError } from '@tarstate/core';
import {
  buildArtifactOutputs,
  checkArtifactOutputs,
} from '@tarstate/schema-tools';
import { artifactManifest } from '../packages/artifacts/source/manifest.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = resolve(root, 'packages/artifacts/src/generated/artifacts.json');
const bindingsPath = resolve(root, 'packages/artifacts/src/generated/bindings.ts');

if (process.argv.includes('--check')) {
  const current = {
    bundleJson: await readFile(bundlePath, 'utf8'),
    bindingsTypeScript: await readFile(bindingsPath, 'utf8'),
  };
  const checked = await checkArtifactOutputs(artifactManifest, current);
  if (!checked.success) throw new TarstateParseError(checked.issues);
} else {
  const built = await buildArtifactOutputs(artifactManifest);
  if (!built.success) throw new TarstateParseError(built.issues);
  await mkdir(dirname(bundlePath), { recursive: true });
  await Promise.all([
    writeFile(bundlePath, built.value.bundleJson),
    writeFile(bindingsPath, built.value.bindingsTypeScript),
  ]);
}
