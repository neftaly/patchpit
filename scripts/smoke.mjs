import { readFile } from 'node:fs/promises';

const html = await readFile('dist/index.html', 'utf8');
if (!html.includes('<div id="root"></div>')) throw new Error('dist/index.html is missing the root mount');
if (!html.includes('/assets/index-')) throw new Error('dist/index.html is missing the root app bundle');
