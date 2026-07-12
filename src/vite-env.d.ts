/// <reference types="vite/client" />

declare module 'virtual:patchpit/sandbox-compat-bundle' {
  const bundle: {
    readonly files: readonly {
      readonly bytes: readonly number[];
      readonly contentType?: string;
      readonly entryId: string;
      readonly name: string;
      readonly order: number;
      readonly parentId: string | null;
      readonly resourceRef: string;
    }[];
  };
  export default bundle;
}
