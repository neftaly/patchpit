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
const workspaceRoots = ['apps', 'packages'] as const;
const rendererCoreRoot = path.join(repoRoot, 'packages/renderer-core');
const reactReglFiberRoot = path.join(repoRoot, 'packages/react-regl-fiber');
const sourceExtensions = new Set(['.ts', '.tsx']);

const upperLayerPackages = [
  {
    label: 'React adapter',
    pattern: /^react-regl-fiber(?:\/|$)/
  },
  {
    label: 'shader build tooling',
    pattern: /^(?:@royal\/)?(?:vite-)?shader-source(?:\/|$)|^vite-plugin-glsl(?:\/|$)/
  }
] as const;

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

function listSourceFiles(root: string): readonly string[] {
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

function externalPackageName(moduleSpecifier: string): string | undefined {
  if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/') || moduleSpecifier.startsWith('node:')) {
    return undefined;
  }

  if (moduleSpecifier.startsWith('@')) {
    const [scope, name] = moduleSpecifier.split('/');

    return scope === undefined || name === undefined ? moduleSpecifier : `${scope}/${name}`;
  }

  return moduleSpecifier.split('/')[0];
}

function declaredPackages(manifest: PackageManifest, options: { readonly allowDevDependencies: boolean }): Set<string> {
  const sections = [
    manifest.dependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
    options.allowDevDependencies ? manifest.devDependencies : undefined
  ];

  return new Set([
    manifest.name,
    ...sections.flatMap((section) => Object.keys(section ?? {}))
  ].filter((dependencyName) => dependencyName !== undefined));
}

describe('package boundaries', () => {
  it('keeps every workspace package private, ESM, and AGPL-covered', () => {
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
        name: '@patchpit/shell',
        private: true,
        root: 'apps/patchpit-shell',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@royal/examples',
        private: true,
        root: 'apps/royal-examples',
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
        name: 'react-regl-fiber',
        private: true,
        root: 'packages/react-regl-fiber',
        type: 'module'
      },
      {
        license: 'AGPL-3.0-only',
        name: '@royal/renderer-core',
        private: true,
        root: 'packages/renderer-core',
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

  it('lets react-regl-fiber be the React facade for renderer-core', () => {
    const manifest = readManifest(path.join(reactReglFiberRoot, 'package.json'));

    expect(manifest.dependencies?.['@royal/renderer-core']).toBe('workspace:*');
  });

  it('keeps renderer-core dependencies below renderer adapters and shader tooling', () => {
    const manifest = readManifest(path.join(rendererCoreRoot, 'package.json'));
    const dependencySections = [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.optionalDependencies,
      manifest.peerDependencies
    ];
    const declaredDependencies = new Set(
      dependencySections.flatMap((section) => Object.keys(section ?? {}))
    );

    for (const boundary of upperLayerPackages) {
      expect(
        [...declaredDependencies].filter((dependencyName) =>
          boundary.pattern.test(dependencyName)
        ),
        `${boundary.label} packages must stay outside renderer-core dependencies`
      ).toEqual([]);
    }
  });

  it('keeps renderer-core imports below renderer adapters and shader tooling', () => {
    const rendererCoreImports = listSourceFiles(path.join(rendererCoreRoot, 'src')).flatMap((filePath) =>
      collectModuleSpecifiers(filePath).map((moduleSpecifier) => ({
        filePath: path.relative(repoRoot, filePath),
        moduleSpecifier
      }))
    );

    for (const boundary of upperLayerPackages) {
      expect(
        rendererCoreImports.filter(({ moduleSpecifier }) =>
          boundary.pattern.test(moduleSpecifier)
        ),
        `${boundary.label} imports must stay outside renderer-core`
      ).toEqual([]);
    }
  });

  it('keeps Node built-ins out of browser package source', () => {
    const clientSourceImports = workspacePackageManifests().flatMap(({ root }) =>
      listSourceFiles(path.join(repoRoot, root, 'src')).flatMap((filePath) =>
        collectModuleSpecifiers(filePath).map((moduleSpecifier) => ({
          filePath: path.relative(repoRoot, filePath),
          moduleSpecifier
        }))
      )
    );

    expect(
      clientSourceImports.filter(({ moduleSpecifier }) => moduleSpecifier.startsWith('node:')),
      'browser packages must keep Node built-ins in tests, scripts, or build tooling'
    ).toEqual([]);
  });

  it('keeps package imports declared by the owning package', () => {
    const rootManifest = readManifest(path.join(repoRoot, 'package.json'));
    const rootTestDependencies = declaredPackages(rootManifest, { allowDevDependencies: true });
    const undeclaredImports = workspacePackageManifests().flatMap(({ manifest, root }) => {
      const declared = declaredPackages(manifest, { allowDevDependencies: false });

      return listSourceFiles(path.join(repoRoot, root, 'src')).flatMap((filePath) => {
        const fileDependencies = filePath.endsWith('.test.ts') ? new Set([...declared, ...rootTestDependencies]) : declared;

        return collectModuleSpecifiers(filePath)
          .map((moduleSpecifier) => externalPackageName(moduleSpecifier))
          .filter((packageName) => packageName !== undefined && !fileDependencies.has(packageName))
          .map((packageName) => ({
            filePath: path.relative(repoRoot, filePath),
            packageName,
            packageRoot: root
          }));
      });
    });

    expect(undeclaredImports, 'external package imports must be declared where they are used').toEqual([]);
  });
});
