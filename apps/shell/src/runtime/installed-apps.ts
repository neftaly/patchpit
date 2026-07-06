import {
  type FilesystemNode,
} from '@patchpit/system';
import { resolvePackageEntry } from './package-entry';

type FilesystemFolder = Extract<FilesystemNode, { readonly kind: 'folder' }>;

export const webBrowserAppId = 'web-browser';

export type FilesystemApp = {
  readonly entry: FilesystemNode | undefined;
  readonly entryKind: 'html' | 'module';
  readonly entryPath: string;
  readonly icon: string;
  readonly id: string;
  readonly name: string;
  readonly packagePath: string;
  readonly packageRoot: FilesystemFolder;
};

type CoreAppSpec = {
  readonly entryKind: FilesystemApp['entryKind'];
  readonly entryPath: string;
  readonly icon: string;
  readonly id: string;
  readonly name: string;
  readonly packagePath: string;
};

const coreAppSpecs: readonly CoreAppSpec[] = [
  {
    entryKind: 'html',
    entryPath: 'index.html',
    icon: '📁',
    id: 'file-picker',
    name: 'File Picker',
    packagePath: '/apps/file-picker',
  },
  {
    entryKind: 'html',
    entryPath: 'index.html',
    icon: '📄',
    id: 'viewer',
    name: 'Viewer',
    packagePath: '/apps/viewer',
  },
  {
    entryKind: 'html',
    entryPath: 'index.html',
    icon: '👋',
    id: 'hello-world',
    name: 'Hello World',
    packagePath: '/apps/hello-world',
  },
];

export function coreAppsFromFilesystem(root: FilesystemNode): readonly FilesystemApp[] {
  return coreAppSpecs.flatMap((spec) => {
    const packageRoot = nodeAtPath(root, spec.packagePath);
    if (packageRoot?.kind !== 'folder') return [];
    return [{
      entry: resolvePackageEntry(packageRoot, spec.entryPath, childEntryNode),
      entryKind: spec.entryKind,
      entryPath: spec.entryPath,
      icon: spec.icon,
      id: spec.id,
      name: spec.name,
      packagePath: spec.packagePath,
      packageRoot,
    }];
  });
}

function childEntryNode(node: FilesystemNode, name: string): FilesystemNode | undefined {
  return node.kind === 'folder' ? childNode(node, name) : undefined;
}

function childNode(node: FilesystemNode, name: string): FilesystemNode | undefined {
  return node.kind === 'folder' ? node.entries.find((entry) => entry.name === name) : undefined;
}

function nodeAtPath(root: FilesystemNode, path: string): FilesystemNode | undefined {
  if (path === '/') return root;
  const parts = path.split('/').filter((part) => part !== '');
  let current: FilesystemNode | undefined = root;
  for (const part of parts) {
    if (current?.kind !== 'folder') return undefined;
    current = childNode(current, part);
  }
  return current;
}
