import { createStaticSandboxDocumentFromFsTree } from '@patchpit/sandbox-fs';
import casesJs from '../apps/sandbox-compat/static/cases.js?raw';
import indexHtml from '../apps/sandbox-compat/static/index.html?raw';
import moduleDepJs from '../apps/sandbox-compat/static/module-dep.js?raw';
import moduleEntryJs from '../apps/sandbox-compat/static/module-entry.js?raw';
import relativeFileSvg from '../apps/sandbox-compat/static/relative-file.svg?raw';
import ghostscriptTigerSvg from '../apps/sandbox-compat/url-backed/Ghostscript_Tiger.svg?raw';

const ghostscriptTigerSrc = 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg';

const appFiles = [
  file('index.html', 'text/html', indexHtml),
  file('cases.js', 'text/javascript', casesJs),
  file('module-dep.js', 'text/javascript', moduleDepJs),
  file('module-entry.js', 'text/javascript', moduleEntryJs),
  file('relative-file.svg', 'image/svg+xml', relativeFileSvg),
  file('ghostscript-tiger.svg', 'image/svg+xml', ghostscriptTigerSvg, ghostscriptTigerSrc),
] as const;

const appTree = {
  entries: appFiles.map((item) => [item.name, { kind: 'file', src: item.src }] as const),
  kind: 'dir',
} as const;

export const createInitialSandboxDocument = () =>
  createStaticSandboxDocumentFromFsTree(appTree, {
    entry: ['index.html'],
    readFile: (requested) => appFiles.find((item) => item.src === requested.src),
  });

function file(
  name: string,
  contentType: string,
  body: string,
  src = `automerge:sandbox-compat/${name}`,
) {
  return { body, contentType, name, src };
}
