/// <reference types="vite/client" />

declare module 'virtual:patchpit/sandbox-compat-bundle' {
  const bundle: {
    readonly contents: Readonly<Record<string, string>>;
    readonly entries: readonly import('@patchpit/fs').FsEntry[];
  };
  export default bundle;
}
