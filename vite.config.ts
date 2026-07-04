import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appPackageNames = new Set(['@patchpit/hello-world']);
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  readonly name?: string;
};

export default defineConfig(({ command }): UserConfig => {
  const isAppPackage =
    manifest.name === undefined ? false : appPackageNames.has(manifest.name);

  if (!isAppPackage && command === 'build') {
    throw new Error(
      'No shared Vite config for package: ' + (manifest.name ?? '<unknown>'),
    );
  }

  return {
    clearScreen: false,
    resolve: {
      alias: [
        {
          find: /^@automerge\/automerge$/,
          replacement: path.join(
            process.cwd(),
            'src/automerge-runtime.ts',
          ),
        },
      ],
    },
    plugins: isAppPackage ? [react()] : [],
    build: {
      target: 'safari17',
      sourcemap: true,
    },
  };
});
