import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const layer = process.argv[2] ?? 'all';
const suffixes = {
  all: '',
  behavior: '.behavior',
  fuzz: '.fuzz',
  integration: '.integration',
};
const suffix = suffixes[layer];
if (suffix === undefined) throw new Error(`Unknown test layer: ${layer}`);

const filesFor = (selectedSuffix) => globSync(`tests/**/*${selectedSuffix}.test.ts`).sort();

const run = (files, isolated) => {
  if (files.length === 0) throw new Error(`No ${layer} tests found`);
  const result = spawnSync(process.execPath, [
    '--import',
    './tests/support/register-ts-loader.mjs',
    '--test',
    ...(isolated ? [] : ['--test-isolation=none']),
    ...files,
  ], { stdio: 'inherit' });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
};

if (layer === 'all') {
  const coreStatus = run([...filesFor('.behavior'), ...filesFor('.fuzz')].sort(), false);
  process.exitCode = coreStatus === 0 ? run(filesFor('.integration'), true) : coreStatus;
} else {
  process.exitCode = run(filesFor(suffix), layer === 'integration');
}
