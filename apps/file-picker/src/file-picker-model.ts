export type FileSelectionOptions = {
  readonly range?: readonly string[];
  readonly toggle?: boolean;
};

export function isDefaultFilePickerFolderOpen(
  rootUrl: string,
  url: string,
): boolean {
  return url === rootUrl;
}
