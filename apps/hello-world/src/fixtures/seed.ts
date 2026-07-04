export type SeedFileType = {
  emoji: string;
  match: string;
};

export type SeedFile = {
  kind: 'file';
  name: string;
  content?: string;
  url?: string;
};

export type SeedFolder = {
  kind: 'folder';
  name: string;
  children: readonly SeedNode[];
};

export type SeedNode = SeedFile | SeedFolder;

export const seedFileTypes = [
  {
    "match": "application/vnd.automerge",
    "emoji": "🔀"
  },
  {
    "match": "application/json",
    "emoji": "🧾"
  },
  {
    "match": "application/*+json",
    "emoji": "🧾"
  },
  {
    "match": "application/x-ndjson",
    "emoji": "🧾"
  },
  {
    "match": "application/javascript",
    "emoji": "💻"
  },
  {
    "match": "application/typescript",
    "emoji": "💻"
  },
  {
    "match": "text/css",
    "emoji": "💻"
  },
  {
    "match": "text/html",
    "emoji": "💻"
  },
  {
    "match": "text/javascript",
    "emoji": "💻"
  },
  {
    "match": "text/typescript",
    "emoji": "💻"
  },
  {
    "match": "text/markdown",
    "emoji": "📝"
  },
  {
    "match": "text/plain",
    "emoji": "📝"
  },
  {
    "match": "model/*",
    "emoji": "🧊"
  },
  {
    "match": "application/pdf",
    "emoji": "📕"
  },
  {
    "match": "application/gzip",
    "emoji": "🗜️"
  },
  {
    "match": "application/x-tar",
    "emoji": "🗜️"
  },
  {
    "match": "application/zip",
    "emoji": "🗜️"
  },
  {
    "match": "audio/*",
    "emoji": "🎵"
  },
  {
    "match": "image/*",
    "emoji": "🖼️"
  },
  {
    "match": "video/*",
    "emoji": "🎞️"
  },
  {
    "match": "*/*",
    "emoji": "📄"
  }
] as const satisfies readonly SeedFileType[];

export const seedTree = {
  "kind": "folder",
  "name": "",
  "children": [
    {
      "kind": "folder",
      "name": "home",
      "children": [
        {
          "kind": "file",
          "name": "README.md",
          "content": "# Home\n\nThis is a tiny filesystem namespace fixture."
        },
        {
          "kind": "file",
          "name": "ghostscript-tiger.svg",
          "url": "https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg"
        }
      ]
    }
  ]
} as const satisfies SeedFolder;
