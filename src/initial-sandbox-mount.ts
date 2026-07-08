import { createSandboxUrlMountFromFsFiles } from '@patchpit/sandbox-fs';
import ghostscriptTigerSvg from '../apps/sandbox-compat/url-backed/Ghostscript_Tiger.svg?raw';

const staticRoot = '../apps/sandbox-compat/static/';
const ghostscriptTigerSrc = 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg';
const staticFileModules = import.meta.glob<string>('../apps/sandbox-compat/static/*', {
  eager: true,
  import: 'default',
  query: '?raw',
});

type AppFile = {
  readonly body: string;
  readonly contentType: string;
  readonly path: readonly string[];
  readonly src: string;
};

const appFiles: readonly AppFile[] = [
  ...Object.entries(staticFileModules).map(([modulePath, body]) => {
    const name = modulePath.slice(staticRoot.length);
    return { body, contentType: contentType(name), path: [name], src: `automerge:sandbox-compat/${name}` };
  }),
  { body: ghostscriptTigerSvg, contentType: 'image/svg+xml', path: ['ghostscript-tiger.svg'], src: ghostscriptTigerSrc },
].sort((left, right) => left.path.join('/').localeCompare(right.path.join('/')));

export const createInitialSandboxMount = () =>
  createSandboxUrlMountFromFsFiles(appFiles, {
    baseUrl: window.location.href,
    entry: ['index.html'],
    mountId: 'sandbox-compat',
});

function contentType(path: string) {
  const extension = path.slice(path.lastIndexOf('.'));
  const type = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
  }[extension];
  if (type === undefined) throw new Error(`Unknown sandbox compat content type: ${path}`);
  return type;
}
