import { fileURLToPath } from 'node:url';
import { readFlatAppBundle } from '../read-app-bundle.ts';

const appPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export const readMarkdownEditorBundle = () => readFlatAppBundle({
  configFile: appPath('vite.config.ts'),
  publicDirectory: appPath('public'),
});
