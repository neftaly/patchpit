import { interpretAsDocumentId, Repo, type AutomergeUrl } from '@automerge/automerge-repo';
import type {
  AutomergeFileContentDoc,
  AutomergeFsFolderDoc,
} from '@patchpit/automerge-fs';
import { createSandboxDocumentFromFsTree } from '@patchpit/sandbox-fs';
import {
  helloWorldContentDocuments,
  helloWorldFolderDocumentUrl,
  helloWorldUrlBackedFixtureFiles,
} from './generated/hello-world-dist';

type FixtureResolution = {
  readonly body: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
};

type FixtureResolver = () => Promise<FixtureResolution>;

export async function createHelloWorldSandboxDocument() {
  const repo = new Repo({ network: [] });
  const [folder, resolvers] = await Promise.all([
    importAutomergeFolderDoc(repo, helloWorldFolderDocumentUrl),
    fixtureResolvers(repo),
  ]);

  return createSandboxDocumentFromFsTree(folder.tree, {
    resolveFile: (file) => {
      const resolve = resolvers.get(file.src);
      if (resolve === undefined) throw new Error(`Missing hello-world fixture content: ${file.src}`);
      return resolve();
    },
  });
}

async function fixtureResolvers(repo: Repo): Promise<ReadonlyMap<string, FixtureResolver>> {
  const automergeEntries = await Promise.all(helloWorldContentDocuments.map(async (file) => {
    const content = await importAutomergeContentDoc(repo, file.automergeDocumentUrl, file.src);
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

async function importAutomergeFolderDoc(
  repo: Repo,
  url: string,
): Promise<AutomergeFsFolderDoc> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load Automerge folder fixture: ${url}`);
  return repo.import<AutomergeFsFolderDoc>(new Uint8Array(await response.arrayBuffer())).doc();
}

async function importAutomergeContentDoc(
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
