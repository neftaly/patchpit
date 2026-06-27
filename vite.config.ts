import { readFileSync } from 'node:fs';
import path from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import glsl from 'vite-plugin-glsl';
import { infinigenDevStreamPlugin } from './apps/infinigen/vite-plugin';

type PackageConfig = {
  readonly external?: readonly string[];
  readonly lib: {
    readonly entry: string | Record<string, string>;
    readonly formats: readonly ['es'];
    readonly fileName: string | ((_format: string, entryName: string) => string);
  };
};

const buildConfigsByPackageName: Record<string, PackageConfig> = {
  '@royal/renderer-core': {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    }
  },
  'react-regl-fiber': {
    external: ['@royal/renderer-core', 'react'],
    lib: {
      entry: {
        index: 'src/index.ts',
        root: 'src/root.ts',
        'jsx-dev-runtime': 'src/jsx-dev-runtime.ts',
        'jsx-runtime': 'src/jsx-runtime.ts'
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    }
  },
  '@royal/react': {
    external: [
      'react-regl-fiber',
      'react-regl-fiber/root',
      'react-regl-fiber/jsx-dev-runtime',
      'react-regl-fiber/jsx-runtime'
    ],
    lib: {
      entry: {
        index: 'src/index.ts',
        root: 'src/root.ts',
        'jsx-dev-runtime': 'src/jsx-dev-runtime.ts',
        'jsx-runtime': 'src/jsx-runtime.ts'
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    }
  }
};

const appPackageNames = new Set([
  '@patchpit/3d-viewer',
  '@patchpit/chargrid-lab',
  '@patchpit/infinigen',
  '@patchpit/shell',
  '@patchpit/tarstate-capability-lab',
  '@patchpit/tarstate-example',
  '@royal/examples'
]);
const reactAppPackageNames = new Set([
  '@patchpit/3d-viewer',
  '@patchpit/shell',
  '@patchpit/tarstate-capability-lab',
  '@patchpit/tarstate-example',
  '@royal/examples'
]);
const fixtureAppPackageNames = new Set(['@patchpit/3d-viewer', '@patchpit/chargrid-lab', '@royal/examples']);
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { readonly name?: string };
const packageConfig = manifest.name ? buildConfigsByPackageName[manifest.name] : undefined;
const isAppPackage = manifest.name === undefined ? false : appPackageNames.has(manifest.name);

const appBase = process.env.BASE_PATH ?? '/';
const devAllPort = Number.parseInt(process.env.DEV_ALL_PORT ?? '', 10);
const devAllServerConfig = Number.isNaN(devAllPort)
  ? {}
  : {
      server: {
        hmr: {
          clientPort: devAllPort
        }
      }
    };
const useBasicSsl = process.env.PATCHPIT_XR_BASIC_SSL === '1';
const repoRoot = path.dirname(new URL(import.meta.url).pathname);
const sourceAliases = [
  {
    find: '@patchpit/tarstate',
    replacement: path.join(repoRoot, 'packages/tarstate/src/index.ts')
  },
  {
    find: '@royal/react/root',
    replacement: path.join(repoRoot, 'packages/royal-react/src/root.ts')
  },
  {
    find: '@royal/react/jsx-dev-runtime',
    replacement: path.join(repoRoot, 'packages/royal-react/src/jsx-dev-runtime.ts')
  },
  {
    find: '@royal/react/jsx-runtime',
    replacement: path.join(repoRoot, 'packages/royal-react/src/jsx-runtime.ts')
  },
  {
    find: '@royal/react',
    replacement: path.join(repoRoot, 'packages/royal-react/src/index.ts')
  },
  {
    find: 'react-regl-fiber/root',
    replacement: path.join(repoRoot, 'packages/react-regl-fiber/src/root.ts')
  },
  {
    find: 'react-regl-fiber/jsx-dev-runtime',
    replacement: path.join(repoRoot, 'packages/react-regl-fiber/src/jsx-dev-runtime.ts')
  },
  {
    find: 'react-regl-fiber/jsx-runtime',
    replacement: path.join(repoRoot, 'packages/react-regl-fiber/src/jsx-runtime.ts')
  },
  {
    find: 'react-regl-fiber',
    replacement: path.join(repoRoot, 'packages/react-regl-fiber/src/index.ts')
  },
  {
    find: '@royal/renderer-core',
    replacement: path.join(repoRoot, 'packages/renderer-core/src/index.ts')
  },
  {
    find: '@royal/tarstate-lens/v1',
    replacement: path.join(repoRoot, 'packages/royal-tarstate-lens/src/v1.ts')
  },
  {
    find: '@royal/tarstate-lens',
    replacement: path.join(repoRoot, 'packages/royal-tarstate-lens/src/index.ts')
  }
];

const failOnRollupWarning = (warning: string | { readonly message?: string }): never => {
  const message = typeof warning === 'string' ? warning : warning.message ?? JSON.stringify(warning);
  throw new Error(`Rollup warning treated as error: ${message}`);
};

const sharedBuildOptions = {
  target: 'safari17',
  sourcemap: true,
  rollupOptions: {
    onwarn: failOnRollupWarning
  }
};

export default ({ command, mode }: { readonly command: string; readonly mode: string }) => {
  const sharedPlugins = [
    glsl({
      include: ['**/*.frag', '**/*.vert'],
      minify: mode === 'production'
    })
  ];

  if (isAppPackage) {
    return {
      base: appBase,
      clearScreen: false,
      ...(fixtureAppPackageNames.has(manifest.name ?? '') ? { publicDir: path.join(repoRoot, 'fixtures') } : {}),
      server: {
        ...(devAllServerConfig.server ?? {})
      },
      plugins: [
        ...(reactAppPackageNames.has(manifest.name ?? '') ? [react()] : []),
        ...(useBasicSsl
          ? [
              basicSsl({
                certDir: path.join(repoRoot, '.patchpit/basic-ssl'),
                domains: ['xr.local', 'localhost', '127.0.0.1'],
                name: 'patchpit-xr'
              })
            ]
          : []),
        ...sharedPlugins,
        ...(manifest.name === '@patchpit/infinigen' ? [infinigenDevStreamPlugin()] : [])
      ],
      resolve: {
        alias: sourceAliases
      },
      build: sharedBuildOptions
    };
  }

  if (packageConfig === undefined) {
    if (command !== 'build') {
      return {
        clearScreen: false,
        plugins: sharedPlugins,
        resolve: {
          alias: sourceAliases
        }
      };
    }

    throw new Error(`No shared Vite config for package: ${manifest.name ?? '<unknown>'}`);
  }

  return {
    clearScreen: false,
    plugins: sharedPlugins,
    build: {
      ...sharedBuildOptions,
      lib: packageConfig.lib,
      rollupOptions: {
        ...sharedBuildOptions.rollupOptions,
        ...(packageConfig.external === undefined ? {} : { external: packageConfig.external })
      }
    }
  };
};
