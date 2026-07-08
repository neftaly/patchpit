import { compileSandboxBootstrapPayload, type SandboxFileBytes } from './data-url-compiler';
import { sandboxIframeBootstrapHtml } from './iframe-bootstrap';
import { sandboxDocumentPathKey, type SandboxDocumentBody, type SandboxDocumentPath } from './path';

export type SandboxDocument = {
  readonly referrerPolicy: 'no-referrer';
  readonly sandbox: 'allow-scripts';
  readonly url: string;
};

export type SandboxDocumentFile = {
  readonly body: SandboxDocumentBody;
  readonly contentType: string;
  readonly path: SandboxDocumentPath;
};

type SandboxDocumentPlan = {
  readonly entryPath: string;
  readonly files: readonly SandboxDocumentPlannedFile[];
};

type SandboxDocumentPlannedFile = {
  readonly file: SandboxDocumentFile;
  readonly path: string;
};

export const createSandboxDocument = async ({
  entry,
  files,
}: {
  readonly entry: SandboxDocumentPath;
  readonly files: readonly SandboxDocumentFile[];
}): Promise<SandboxDocument> => {
  const plan = sandboxDocumentPlan(entry, files);

  return {
    referrerPolicy: 'no-referrer',
    sandbox: 'allow-scripts',
    url: textDataUrl('text/html;charset=utf-8', sandboxIframeBootstrapHtml(compileSandboxBootstrapPayload(
      plan.entryPath,
      await Promise.all(plan.files.map(({ file, path }) => sandboxFileBytes(file, path))),
    ))),
  };
};

const sandboxDocumentPlan = (
  entry: SandboxDocumentPath,
  files: readonly SandboxDocumentFile[],
): SandboxDocumentPlan => {
  const entryPath = sandboxDocumentPathKey(entry);
  const plannedFiles = files.map((file) => ({ file, path: sandboxDocumentPathKey(file.path) }));
  const duplicatePath = firstDuplicate(plannedFiles.map((file) => file.path));
  if (duplicatePath !== undefined) throw new Error(`Duplicate sandbox document path: ${duplicatePath}`);

  return { entryPath, files: plannedFiles };
};

const sandboxFileBytes = async (file: SandboxDocumentFile, path: string): Promise<SandboxFileBytes> => ({
  body: await bodyBytes(file.body),
  contentType: file.contentType,
  path,
});

const firstDuplicate = (values: readonly string[]): string | undefined => {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
};

const textDataUrl = (contentType: string, body: string): string =>
  `data:${contentType},${encodeURIComponent(body)}`;

const bodyBytes = async (body: SandboxDocumentBody): Promise<Uint8Array> => {
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  return ArrayBuffer.isView(body)
    ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    : new Uint8Array(body);
};
