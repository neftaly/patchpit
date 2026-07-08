import { compileOpaqueSandboxPayload, type NormalizedSandboxFile } from './opaque-compiler';
import { opaqueBootstrap } from './opaque-runtime';
import { sandboxDocumentPathKey, type SandboxDocumentBody, type SandboxDocumentPath } from './path';

type OpaqueSandboxDocument = {
  readonly sandbox: 'allow-scripts';
  readonly url: string;
};

type OpaqueSandboxFile = {
  readonly body: SandboxDocumentBody;
  readonly contentType: string;
  readonly path: SandboxDocumentPath;
};

export const createOpaqueSandboxDocument = async ({
  entry,
  files,
}: {
  readonly entry: SandboxDocumentPath;
  readonly files: readonly OpaqueSandboxFile[];
}): Promise<OpaqueSandboxDocument> => {
  const entryPath = sandboxDocumentPathKey(entry);
  const filePaths = files.map((file) => sandboxDocumentPathKey(file.path));
  const duplicatePath = duplicate(filePaths);
  if (duplicatePath !== undefined) throw new Error(`Duplicate sandbox document path: ${duplicatePath}`);

  return {
    sandbox: 'allow-scripts',
    url: textDataUrl('text/html; charset=utf-8', opaqueBootstrap(compileOpaqueSandboxPayload(
      entryPath,
      await Promise.all(files.map((file, index) => normalizeFile(file, filePaths[index] as string))),
    ))),
  };
};

const normalizeFile = async (file: OpaqueSandboxFile, path: string): Promise<NormalizedSandboxFile> => ({
  body: await bodyBytes(file.body),
  contentType: file.contentType,
  path,
});

const duplicate = (values: readonly string[]): string | undefined => {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
};

const textDataUrl = (contentType: string, body: string): string =>
  `data:${dataUrlContentType(contentType)},${encodeURIComponent(body)}`;

const dataUrlContentType = (contentType: string): string =>
  contentType.split(';').map((part) => part.trim()).join(';');

const bodyBytes = async (body: SandboxDocumentBody): Promise<Uint8Array> => {
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  return ArrayBuffer.isView(body)
    ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    : new Uint8Array(body);
};
