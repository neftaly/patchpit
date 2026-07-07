import type { DocHandle } from '@automerge/automerge-repo';
import type { SeedFilesystem } from '@patchpit/system';

export type BootstrapRuntimeResourceStore = {
  readonly documentUrls: BootstrapRuntimeDocumentUrls;
  readonly rootUrl: string;
  getDocument<T = unknown>(url: string): T | undefined;
  subscribeDocument(url: string, listener: () => void): () => void;
};

export type BootstrapRuntimeDocumentUrls = {
  readonly appearance: string;
  readonly darkTheme: string;
  readonly filePickerState: string;
  readonly fileTypes: string;
  readonly filesystemIndex: string;
  readonly lightTheme: string;
  readonly runtimeState: string;
  readonly windowManager: string;
};

export function createBootstrapRuntimeResourceStore(seed: SeedFilesystem): BootstrapRuntimeResourceStore {
  return {
    documentUrls: {
      appearance: seed.appearanceHandle.url,
      darkTheme: seed.darkThemeHandle.url,
      filePickerState: seed.filePickerStateHandle.url,
      fileTypes: seed.fileTypesHandle.url,
      filesystemIndex: seed.indexHandle.url,
      lightTheme: seed.lightThemeHandle.url,
      runtimeState: seed.runtimeStateHandle.url,
      windowManager: seed.windowManagerHandle.url,
    },
    rootUrl: seed.rootUrl,

    getDocument<T = unknown>(url: string) {
      return documentHandleForUrl(seed, url)?.doc() as T | undefined;
    },

    subscribeDocument(url: string, listener) {
      const handle = documentHandleForUrl(seed, url);
      if (handle === undefined) return () => {};
      handle.on('change', listener);
      return () => handle.off('change', listener);
    },
  };
}

function documentHandleForUrl(seed: SeedFilesystem, url: string): DocHandle<unknown> | undefined {
  if (url === seed.indexHandle.url) return seed.indexHandle as DocHandle<unknown>;
  return seed.documentHandles[url] as DocHandle<unknown> | undefined;
}
