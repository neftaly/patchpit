import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  readonly name?: string;
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
  readonly type?: string;
};

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoots = ['apps', 'packages'] as const;

function readManifest(manifestPath: string): PackageManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest;
}

function workspacePackageManifests(): readonly { readonly root: string; readonly manifest: PackageManifest }[] {
  return workspaceRoots.flatMap((workspaceRoot) => {
    const absoluteRoot = path.join(repoRoot, workspaceRoot);

    if (!existsSync(absoluteRoot)) {
      return [];
    }

    return readdirSync(absoluteRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => {
        const packageRoot = path.join(absoluteRoot, entry.name);

        return {
          root: path.relative(repoRoot, packageRoot),
          manifest: readManifest(path.join(packageRoot, 'package.json'))
        };
      });
  });
}

describe('package boundaries', () => {
  it('keeps every workspace package private while v2 contracts are moving', () => {
    expect(
      workspacePackageManifests().map(({ manifest, root }) => ({
        name: manifest.name,
        private: manifest.private,
        root,
        type: manifest.type
      }))
    ).toEqual([
      {
        name: '@patchpit/shell',
        private: true,
        root: 'apps/patchpit-shell',
        type: 'module'
      }
    ]);
  });

  it('keeps reusable packages independent from app packages', () => {
    const manifests = workspacePackageManifests();
    const packageManifests = manifests.filter(({ root }) => root.startsWith('packages/'));
    const appPackageNames = new Set(
      manifests.filter(({ root }) => root.startsWith('apps/')).map(({ manifest }) => manifest.name)
    );

    expect(
      packageManifests.flatMap(({ manifest, root }) =>
        Object.keys(manifest.dependencies ?? {})
          .filter((dependencyName) => appPackageNames.has(dependencyName))
          .map((dependencyName) => ({ dependencyName, root }))
      )
    ).toEqual([]);
  });
});
