export type FilesystemFixtureFolder = {
  name: string
  entries: FilesystemFixtureEntry[]
}

export type FilesystemFixtureFile = {
  name: string
  role: string
  content: string | Record<string, unknown>
}

export type FilesystemFixtureEntry =
  | ({ type: 'folder' } & FilesystemFixtureFolder)
  | ({ type: 'file' } & FilesystemFixtureFile)

export const filesystemFixture: FilesystemFixtureFolder = {
  name: 'tiny-checkers',
  entries: [
    {
      type: 'file',
      name: 'probability.json',
      role: 'manifest',
      content: {
        title: 'Tiny Checkers',
        board: 'assets/board.md',
        rules: 'src/rules.ts',
      },
    },
    {
      type: 'folder',
      name: 'src',
      entries: [
        {
          type: 'file',
          name: 'rules.ts',
          role: 'source',
          content: [
            'export function legalMove(from: string, to: string) {',
            '  return from !== to',
            '}',
            '',
          ].join('\n'),
        },
      ],
    },
    {
      type: 'folder',
      name: 'assets',
      entries: [
        {
          type: 'file',
          name: 'board.md',
          role: 'asset',
          content: '# Board\n\n8x8 grid, alternating dark and light squares.\n',
        },
        {
          type: 'file',
          name: 'cover.svg',
          role: 'asset',
          content: [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">',
            '<rect width="160" height="100" fill="#f8f8f8"/>',
            '<rect x="20" y="20" width="120" height="60" fill="#fff" stroke="#111"/>',
            '<circle cx="58" cy="50" r="14" fill="#c33"/>',
            '<circle cx="102" cy="50" r="14" fill="#222"/>',
            '<text x="80" y="88" text-anchor="middle" font-family="monospace" font-size="10">tiny checkers</text>',
            '</svg>',
            '',
          ].join('\n'),
        },
      ],
    },
    {
      type: 'file',
      name: 'notes.md',
      role: 'notes',
      content:
        '# Notes\n\nThe folder owns path resolution. File docs keep stable identity.\n',
    },
  ],
}
