import { folderAssetPath } from './config.mjs';
import { importSpecifier } from './paths.mjs';

export function generatedModule(contentDocs, urlFiles) {
  const imports = [
    `import folderDoc from ${JSON.stringify(importSpecifier(folderAssetPath))};`,
    ...contentDocs.map((file, index) =>
      `import contentDoc${index} from ${JSON.stringify(importSpecifier(file.assetPath))};`),
    ...urlFiles.map((file, index) =>
      `import urlBackedFile${index} from ${JSON.stringify(importSpecifier(file.assetPath))};`),
  ].join('\n');

  return `${imports}

export const helloWorldFolderDocumentUrl = folderDoc;

export const helloWorldContentDocuments = [
${contentDocs.map((file, index) => `  {
    src: ${JSON.stringify(file.src)},
    automergeDocumentUrl: contentDoc${index},
  },`).join('\n')}
] as const;

export const helloWorldUrlBackedFixtureFiles: Readonly<Record<string, {
  readonly assetUrl: string;
  readonly contentType: string;
}>> = {
${urlFiles.map((file, index) => `  [${JSON.stringify(file.url)}]: {
    assetUrl: urlBackedFile${index},
    contentType: ${JSON.stringify(file.contentType)},
  },`).join('\n')}
};
`;
}
