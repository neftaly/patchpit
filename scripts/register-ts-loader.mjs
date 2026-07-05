import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith('file:') && specifier.startsWith('.')) {
      const resolvedSpecifierPath = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      const candidatePaths = specifier.endsWith('.js')
        ? [`${resolvedSpecifierPath.slice(0, -3)}.ts`]
        : [
            resolvedSpecifierPath,
            `${resolvedSpecifierPath}.ts`,
            resolve(resolvedSpecifierPath, 'index.ts'),
          ];
      for (const candidate of candidatePaths) {
        if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
        return {
          shortCircuit: true,
          url: pathToFileURL(candidate).href,
        };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context);

    const typescriptSource = readFileSync(fileURLToPath(url), 'utf8');
    const transpiledModule = ts.transpileModule(typescriptSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
      fileName: fileURLToPath(url),
    });

    return {
      format: 'module',
      shortCircuit: true,
      source: transpiledModule.outputText,
    };
  },
});
