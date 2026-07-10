// Lets Node tests import local TypeScript files without a build step.
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

const isFile = (path) => statSync(path, { throwIfNoEntry: false })?.isFile() === true;

const localTypeScriptModulePath = (specifier, parentURL) => {
  if (!parentURL?.startsWith('file:') || !specifier.startsWith('.')) return undefined;
  const importPath = resolve(dirname(fileURLToPath(parentURL)), specifier);
  const candidates = specifier.endsWith('.js')
    ? [`${importPath.slice(0, -3)}.ts`]
    : [importPath, `${importPath}.ts`, resolve(importPath, 'index.ts')];
  return candidates.find(isFile);
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const path = localTypeScriptModulePath(specifier, context.parentURL);
    return path === undefined
      ? nextResolve(specifier, context)
      : { shortCircuit: true, url: pathToFileURL(path).href };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context);

    return {
      format: 'module',
      shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform' }),
    };
  },
});
