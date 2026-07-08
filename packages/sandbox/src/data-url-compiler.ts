import { sandboxContentSecurityPolicy, type SandboxBootstrapPayload } from './iframe-bootstrap';

export type SandboxFileBytes = {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly path: string;
};

export const compileSandboxBootstrapPayload = (
  entryFile: SandboxFileBytes,
  files: readonly SandboxFileBytes[],
): SandboxBootstrapPayload => ({
  contentSecurityPolicy: sandboxContentSecurityPolicy,
  entryHtml: textDecoder.decode(entryFile.body),
  entryPath: entryFile.path,
  fileDataUrls: files.map((file) => [file.path, dataUrl(file.contentType, file.body)]),
  htmlFiles: files
    .filter((file) => file.contentType.startsWith('text/html'))
    .map((file) => [file.path, textDecoder.decode(file.body)]),
});

const textDecoder = new TextDecoder();

const dataUrl = (contentType: string, body: Uint8Array): string =>
  `data:${contentType};base64,${bytesBase64(body)}`;

const bytesBase64 = (bytes: Uint8Array): string => {
  let base64 = '';
  for (let index = 0; index < bytes.length; index += 0x6000) {
    base64 += btoa(String.fromCharCode(...bytes.subarray(index, index + 0x6000)));
  }
  return base64;
};
