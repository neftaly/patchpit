export type SandboxDocumentBody = string | Blob | BufferSource;
export type SandboxDocumentPath = readonly string[];

export const sandboxDocumentPathKey = (path: SandboxDocumentPath): string => {
  if (path.length === 0 || path.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Sandbox document paths must be non-empty relative file paths: ${path.join('/')}`);
  }
  return path.map(encodeURIComponent).join('/');
};
