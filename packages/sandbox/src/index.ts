import { createOpaqueSandboxDocument } from './opaque-document';
import type { SandboxDocumentBody as SandboxDocumentBodyType, SandboxDocumentPath } from './path';

export { sandboxDocumentPathKey, type SandboxDocumentBody, type SandboxDocumentPath } from './path';

export type SandboxDocument = {
  readonly sandbox: 'allow-scripts';
  readonly url: string;
};

export type SandboxDocumentFile = {
  readonly body: SandboxDocumentBodyType;
  readonly contentType: string;
  readonly path: SandboxDocumentPath;
};

export const createSandboxDocument = async ({
  entry,
  files,
}: {
  readonly entry: SandboxDocumentPath;
  readonly files: readonly SandboxDocumentFile[];
}): Promise<SandboxDocument> =>
  createOpaqueSandboxDocument({ entry, files });
