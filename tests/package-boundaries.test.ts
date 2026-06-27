import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  readonly name?: string;
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly license?: string;
  readonly optionalDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly type?: string;
};

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const royalGitPrefix = 'git+https://github.com/neftaly/royal.git#a762613a3aa00f2c923217e3e0c2f7536064ef7d&path:/packages/';
const workspaceRoots = [
  'apps/chargrid-lab',
  'apps/infinigen',
  'apps/patchpit-3d-viewer',
  'apps/patchpit-shell',
  'apps/tarstate-capability-lab',
  'apps/tarstate-example',
  'packages/connectors',
  'packages/tarstate'
] as const;
const migratedRoyalRoots = [
  'apps/royal-examples',
  'packages/react-regl-fiber',
  'packages/renderer-core',
  'packages/royal-react',
  'packages/royal-tarstate-lens'
] as const;
const sourceExtensions = new Set(['.ts', '.tsx']);

function readManifest(manifestPath: string): PackageManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest;
}

function workspacePackageManifests(): readonly { readonly root: string; readonly manifest: PackageManifest }[] {
  return workspaceRoots.map((root) => ({
    root,
    manifest: readManifest(path.join(repoRoot, root, 'package.json'))
  }));
}

function listSourceFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function collectModuleSpecifiers(filePath: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;

      if (argument !== undefined && ts.isStringLiteral(argument)) {
        specifiers.push(argument.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function expectRoyalGitDependency(
  dependencies: Record<string, string> | undefined,
  packageName: string,
  packagePath: string
): void {
  expect(dependencies?.[packageName]).toBe(`${royalGitPrefix}${packagePath}`);
}

describe('package boundaries', () => {
  it('keeps every Patchpit workspace package private, ESM, and AGPL-covered', () => {
    expect(
      workspacePackageManifests().map(({ manifest, root }) => ({
        license: manifest.license,
        name: manifest.name,
        private: manifest.private,
        root,
        type: manifest.type
      }))
    ).toEqual([
      {
        license: 'AGPL-3.0-only',
        name: '@patchpit/chargrid-lab',
        private: true,
        root: 'apps/chargrid-lab',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@patchpit/infinigen',
        private: true,
        root: 'apps/infinigen',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@patchpit/3d-viewer',
        private: true,
        root: 'apps/patchpit-3d-viewer',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@patchpit/shell',
        private: true,
        root: 'apps/patchpit-shell',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@patchpit/tarstate-capability-lab',
        private: true,
        root: 'apps/tarstate-capability-lab',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@patchpit/tarstate-example',
        private: true,
        root: 'apps/tarstate-example',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@patchpit/connectors',
        private: true,
        root: 'packages/connectors',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@patchpit/tarstate',
        private: true,
        root: 'packages/tarstate',
        type: 'module'
      }
    ]);
  });

  it('keeps migrated Royal code out of the Patchpit workspace', () => {
    const workspaceConfig = readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');

    for (const root of migratedRoyalRoots) {
      expect(workspaceConfig).not.toContain(`  - ${root}`);
    }

    expect(workspaceConfig).not.toContain('  - apps/*');
    expect(workspaceConfig).not.toContain('  - packages/*');
  });

  it('consumes Royal packages from the pinned Royal Git source', () => {
    const rootManifest = readManifest(path.join(repoRoot, 'package.json'));
    const chargridManifest = readManifest(path.join(repoRoot, 'apps/chargrid-lab/package.json'));
    const infinigenManifest = readManifest(path.join(repoRoot, 'apps/infinigen/package.json'));
    const viewerManifest = readManifest(path.join(repoRoot, 'apps/patchpit-3d-viewer/package.json'));

    expectRoyalGitDependency(rootManifest.devDependencies, '@royal/renderer-core', 'renderer-core');
    expectRoyalGitDependency(rootManifest.devDependencies, '@royal/react', 'react-royal-fiber');
    expectRoyalGitDependency(rootManifest.devDependencies, '@royal/tarstate-lens', 'royal-tarstate-lens');
    expectRoyalGitDependency(chargridManifest.dependencies, '@royal/renderer-core', 'renderer-core');
    expectRoyalGitDependency(chargridManifest.dependencies, '@royal/react', 'react-royal-fiber');
    expectRoyalGitDependency(chargridManifest.dependencies, '@royal/tarstate-lens', 'royal-tarstate-lens');
    expectRoyalGitDependency(infinigenManifest.dependencies, '@royal/renderer-core', 'renderer-core');
    expectRoyalGitDependency(viewerManifest.dependencies, '@royal/react', 'react-royal-fiber');
  });

  it('keeps reusable Patchpit packages independent from app packages', () => {
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

  it('keeps Node built-ins out of browser package source', () => {
    const clientSourceImports = workspacePackageManifests().flatMap(({ root }) =>
      listSourceFiles(path.join(repoRoot, root, 'src')).flatMap((filePath) => {
        if (filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) {
          return [];
        }

        return collectModuleSpecifiers(filePath).map((moduleSpecifier) => ({
          filePath: path.relative(repoRoot, filePath),
          moduleSpecifier
        }));
      })
    );

    expect(
      clientSourceImports.filter(({ moduleSpecifier }) => moduleSpecifier.startsWith('node:')),
      'browser packages must keep Node built-ins in tests, scripts, or build tooling'
    ).toEqual([]);
  });
});
