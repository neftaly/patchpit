import { compileSandboxBootstrapPayload, type SandboxFileBytes } from './data-url-compiler';
import { sandboxIframeBootstrapHtml } from './iframe-bootstrap';
import { sandboxDocumentPathKey, type SandboxDocumentBody, type SandboxDocumentPath } from './path';

export type SandboxDocument = {
  readonly sandbox: 'allow-scripts';
  readonly url: string;
};

export type SandboxDocumentFile = {
  readonly body: SandboxDocumentBody;
  readonly contentType: string;
  readonly path: SandboxDocumentPath;
};

export const createSandboxDocument = async ({
  entry,
  files,
}: {
  readonly entry: SandboxDocumentPath;
  readonly files: readonly SandboxDocumentFile[];
}): Promise<SandboxDocument> => {
  const entryPath = sandboxDocumentPathKey(entry);
  const filePaths = files.map((file) => sandboxDocumentPathKey(file.path));
  const duplicatePath = duplicate(filePaths);
  if (duplicatePath !== undefined) throw new Error(`Duplicate sandbox document path: ${duplicatePath}`);

  return {
    sandbox: 'allow-scripts',
    url: textDataUrl('text/html; charset=utf-8', sandboxIframeBootstrapHtml(compileSandboxBootstrapPayload(
      entryPath,
      await Promise.all(files.map((file, index) => sandboxFileBytes(file, filePaths[index] as string))),
    ))),
  };
};

const sandboxFileBytes = async (file: SandboxDocumentFile, path: string): Promise<SandboxFileBytes> => ({
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
