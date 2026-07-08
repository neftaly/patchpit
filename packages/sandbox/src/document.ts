import { sandboxDocumentPathKey, type SandboxDocumentPath } from './path';

export type SandboxDocument = {
  readonly dispose?: () => void | Promise<void>;
  readonly referrerPolicy: 'no-referrer';
  readonly sandbox: 'allow-scripts';
  readonly url: string;
};

export type SandboxDocumentFilePath = {
  readonly path: SandboxDocumentPath;
};

export type SandboxDocumentPlan<TFile extends SandboxDocumentFilePath> = {
  readonly entryFileIndex: number;
  readonly entryPath: string;
  readonly files: readonly SandboxDocumentPlannedFile<TFile>[];
};

export type SandboxDocumentPlannedFile<TFile extends SandboxDocumentFilePath> = {
  readonly file: TFile;
  readonly path: string;
};

export const createSandboxDocument = async ({
  entry,
  files,
}: {
  readonly entry: SandboxDocumentPath;
  readonly files: readonly SandboxDocumentFilePath[];
}): Promise<SandboxDocument> => {
  planSandboxDocument(entry, files);
  throw new Error('Sandbox URL mounts are not implemented yet.');
};

export const planSandboxDocument = <TFile extends SandboxDocumentFilePath>(
  entry: SandboxDocumentPath,
  files: readonly TFile[],
): SandboxDocumentPlan<TFile> => {
  const entryPath = sandboxDocumentPathKey(entry);
  const plannedFiles = files.map((file) => ({ file, path: sandboxDocumentPathKey(file.path) }));
  const duplicatePath = firstDuplicate(plannedFiles.map((file) => file.path));
  if (duplicatePath !== undefined) throw new Error(`Duplicate sandbox document path: ${duplicatePath}`);
  const entryFileIndex = plannedFiles.findIndex((file) => file.path === entryPath);
  if (entryFileIndex === -1) throw new Error(`Sandbox entry file is missing: ${entryPath}`);

  return { entryFileIndex, entryPath, files: plannedFiles };
};

const firstDuplicate = (values: readonly string[]): string | undefined => {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
};
