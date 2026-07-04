export function folderIcon(isOpen: boolean): string {
  return isOpen ? '📂' : '📁';
}

type IconRule = {
  readonly emoji: string;
  readonly match: {
    readonly extensions?: readonly string[];
    readonly mediaPrefixes?: readonly string[];
    readonly mediaTypes?: readonly string[];
  };
};

type IconIndex = {
  readonly extensions: ReadonlyMap<string, string>;
  readonly mediaPrefixes: readonly (readonly [prefix: string, emoji: string])[];
  readonly mediaTypes: ReadonlyMap<string, string>;
};

const iconRules: readonly IconRule[] = [
  {
    emoji: '🔀',
    match: {
      mediaTypes: [
        'application/vnd.automerge',
        'application/vnd.automerge+binary',
        'application/x-automerge',
      ],
      extensions: ['automerge', 'amrg'],
    },
  },
  { emoji: '🖼️', match: { mediaPrefixes: ['image/'] } },
  { emoji: '🎵', match: { mediaPrefixes: ['audio/'] } },
  { emoji: '🎞️', match: { mediaPrefixes: ['video/'] } },
  {
    emoji: '💻',
    match: {
      mediaTypes: [
        'application/javascript',
        'application/typescript',
        'text/css',
        'text/html',
        'text/javascript',
        'text/typescript',
      ],
      extensions: ['css', 'html', 'js', 'jsx', 'mjs', 'ts', 'tsx'],
    },
  },
  {
    emoji: '🧾',
    match: {
      mediaTypes: ['application/json', 'application/ld+json', 'application/x-ndjson'],
      extensions: ['json', 'jsonl'],
    },
  },
  {
    emoji: '📝',
    match: {
      mediaTypes: ['text/markdown', 'text/plain'],
      extensions: ['md', 'mdx', 'txt'],
    },
  },
  {
    emoji: '🧊',
    match: {
      mediaTypes: ['model/gltf+json', 'model/gltf-binary', 'model/obj', 'model/stl'],
      extensions: ['glb', 'gltf', 'obj', 'stl'],
    },
  },
  { emoji: '📕', match: { mediaTypes: ['application/pdf'] } },
  {
    emoji: '🗜️',
    match: {
      mediaTypes: ['application/gzip', 'application/x-tar', 'application/zip'],
      extensions: ['gz', 'tar', 'tgz', 'zip'],
    },
  },
];

const iconIndex = indexIconRules(iconRules);

export function fileIcon(mediaType: string, name: string): string | null {
  return (
    iconIndex.mediaTypes.get(mediaType) ??
    iconIndex.mediaPrefixes.find(([prefix]) => mediaType.startsWith(prefix))?.[1] ??
    iconIndex.extensions.get(extensionFromName(name)) ??
    null
  );
}

function indexIconRules(rules: readonly IconRule[]): IconIndex {
  return {
    extensions: new Map(indexMatches(rules, 'extensions')),
    mediaPrefixes: indexMatches(rules, 'mediaPrefixes'),
    mediaTypes: new Map(indexMatches(rules, 'mediaTypes')),
  };
}

function indexMatches(
  rules: readonly IconRule[],
  key: keyof IconRule['match'],
): readonly (readonly [value: string, emoji: string])[] {
  return rules.flatMap(({ emoji, match }) =>
    (match[key] ?? []).map((value) => [value, emoji] as const),
  );
}

function extensionFromName(name: string): string {
  const extensionStart = name.lastIndexOf('.');
  return extensionStart === -1 ? '' : name.slice(extensionStart + 1).toLowerCase();
}
