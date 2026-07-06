import type { FilesystemNode } from '@patchpit/system';

export type FileSelectionOptions =
  | { readonly selectedUrls: readonly string[]; readonly toggle?: never }
  | { readonly selectedUrls?: never; readonly toggle: true };

export function isDefaultFilePickerFolderOpen(
  rootUrl: string,
  url: string,
): boolean {
  return url === rootUrl;
}

export function isFilePickerFolderOpen(
  openFolders: Readonly<Record<string, boolean>>,
  url: string,
  rootUrl: string,
): boolean {
  return openFolders[url] ?? isDefaultFilePickerFolderOpen(rootUrl, url);
}

export function listVisibleFilePickerUrls(
  node: FilesystemNode,
  openFolders: Readonly<Record<string, boolean>>,
  rootUrl: string,
): readonly string[] {
  if (node.kind === 'file' || !isFilePickerFolderOpen(openFolders, node.url, rootUrl)) {
    return [node.url];
  }
  return [
    node.url,
    ...node.entries.flatMap((entry) => listVisibleFilePickerUrls(entry, openFolders, rootUrl)),
  ];
}

export function filePickerSelectionRange(
  selectionAnchorUrl: string | undefined,
  url: string,
  visibleUrls: readonly string[],
): readonly string[] {
  if (selectionAnchorUrl === undefined) return [url];

  const anchorIndex = visibleUrls.indexOf(selectionAnchorUrl);
  const selectedIndex = visibleUrls.indexOf(url);

  return anchorIndex === -1 || selectedIndex === -1
    ? [url]
    : visibleUrls.slice(Math.min(anchorIndex, selectedIndex), Math.max(anchorIndex, selectedIndex) + 1);
}
