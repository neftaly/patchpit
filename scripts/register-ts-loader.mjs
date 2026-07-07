// Lets Node tests import local TypeScript files without a build step.
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import ts from 'typescript';

const isFile = (path) => statSync(path, { throwIfNoEntry: false })?.isFile() === true;

const localTypeScriptModulePath = (specifier, parentURL) => {
  if (!parentURL?.startsWith('file:') || !specifier.startsWith('.')) return undefined;
  const importPath = resolve(dirname(fileURLToPath(parentURL)), specifier);
  const candidates = specifier.endsWith('.js')
    ? [`${importPath.slice(0, -3)}.ts`]
    : [importPath, `${importPath}.ts`, resolve(importPath, 'index.ts')];
  return candidates.find(isFile);
};

const transpileTypeScriptModule = (url) => {
  const path = fileURLToPath(url);
  return ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: path,
  }).outputText;
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
      source: transpileTypeScriptModule(url),
    };
  },
});
