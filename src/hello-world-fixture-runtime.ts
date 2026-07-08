import { interpretAsDocumentId, Repo, type AutomergeUrl } from '@automerge/automerge-repo';
import type {
  AutomergeFileContentDoc,
  AutomergeFsFolderDoc,
} from '@patchpit/automerge-fs';
import { createStaticSandboxDocumentFromFsTree } from '@patchpit/sandbox-fs';
import {
  helloWorldContentDocuments,
  helloWorldFolderDocumentUrl,
  helloWorldUrlBackedFixtureFiles,
} from './generated/hello-world-dist';

type FixtureFileContent = {
  readonly body: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
};

type FixtureFileReader = () => Promise<FixtureFileContent>;

export async function createHelloWorldSandboxDocument() {
  const repo = new Repo({ network: [] });
  const [folderDoc, fileReaders] = await Promise.all([
    importAutomergeFsFolderDoc(repo, helloWorldFolderDocumentUrl),
    fixtureFileReaders(repo),
  ]);

  return createStaticSandboxDocumentFromFsTree(folderDoc.tree, {
    entry: ['index.html'],
    readFile: (file) => {
      const readFile = fileReaders.get(file.src);
      if (readFile === undefined) throw new Error(`Missing hello-world fixture content: ${file.src}`);
      return readFile();
    },
  });
}

async function fixtureFileReaders(repo: Repo): Promise<ReadonlyMap<string, FixtureFileReader>> {
  const automergeEntries = await Promise.all(helloWorldContentDocuments.map(async (file) => {
    const content = await importAutomergeFileContentDoc(repo, file.automergeDocumentUrl, file.src);
    return [file.src, async () => ({
      body: new Uint8Array(content.bytes),
      contentType: content.contentType,
    })] as const;
  }));
  const urlEntries = Object.entries(helloWorldUrlBackedFixtureFiles)
    .map(([src, file]) => [src, async () => {
      const response = await fetch(file.assetUrl);
      if (!response.ok) throw new Error(`Failed to load generated URL-backed fixture: ${src}`);
      return {
        body: new Uint8Array(await response.arrayBuffer()),
        contentType: file.contentType,
      };
    }] as const);
  return new Map([...automergeEntries, ...urlEntries]);
}

async function importAutomergeFsFolderDoc(
  repo: Repo,
  url: string,
): Promise<AutomergeFsFolderDoc> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load Automerge folder fixture: ${url}`);
  return repo.import<AutomergeFsFolderDoc>(new Uint8Array(await response.arrayBuffer())).doc();
}

async function importAutomergeFileContentDoc(
  repo: Repo,
  url: string,
  src: string,
): Promise<AutomergeFileContentDoc> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load Automerge fixture doc: ${url}`);
  return repo.import<AutomergeFileContentDoc>(
    new Uint8Array(await response.arrayBuffer()),
    { docId: interpretAsDocumentId(src as AutomergeUrl) },
  ).doc();
}
