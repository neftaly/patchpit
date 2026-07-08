import folderDoc from "./hello-world-dist/folder.automerge?url";
import contentDoc0 from "./hello-world-dist/automerge%3A2Akz4ka3tiFSXfFht39rhVbzjJz2.automerge?url";
import contentDoc1 from "./hello-world-dist/automerge%3A2SHKcJN9wDgEMpKkM117Jh8UEdhb.automerge?url";
import contentDoc2 from "./hello-world-dist/automerge%3A3GB3YCpSr4QY2Hde61qrJHFCCVSF.automerge?url";
import contentDoc3 from "./hello-world-dist/automerge%3A2bw3hGLFxUb4ks2dSQFmxzR5WeTR.automerge?url";
import urlBackedFile0 from "./hello-world-dist/https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2Ff%2Ffd%2FGhostscript_Tiger.svg.svg?url";

export const helloWorldFolderDocumentUrl = folderDoc;

export const helloWorldContentDocuments = [
  {
    src: "automerge:2Akz4ka3tiFSXfFht39rhVbzjJz2",
    automergeDocumentUrl: contentDoc0,
  },
  {
    src: "automerge:2SHKcJN9wDgEMpKkM117Jh8UEdhb",
    automergeDocumentUrl: contentDoc1,
  },
  {
    src: "automerge:3GB3YCpSr4QY2Hde61qrJHFCCVSF",
    automergeDocumentUrl: contentDoc2,
  },
  {
    src: "automerge:2bw3hGLFxUb4ks2dSQFmxzR5WeTR",
    automergeDocumentUrl: contentDoc3,
  },
] as const;

export const helloWorldUrlBackedFixtureFiles: Readonly<Record<string, {
  readonly assetUrl: string;
  readonly contentType: string;
}>> = {
  ["https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg"]: {
    assetUrl: urlBackedFile0,
    contentType: "image/svg+xml",
  },
};
