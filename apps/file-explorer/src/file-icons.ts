import mime from 'mime/lite'

export type FileIconMimeRule = {
  emoji: string
  mimeTypes?: readonly string[]
  mimePrefixes?: readonly string[]
  extensions?: readonly string[]
}

export const defaultFileIcon = '📄'

export const fileIconMimeRules: readonly FileIconMimeRule[] = [
  {
    emoji: '🔀',
    mimeTypes: [
      'application/vnd.automerge',
      'application/vnd.automerge+binary',
      'application/x-automerge',
    ],
    extensions: ['automerge', 'amrg'],
  },
  { emoji: '🖼️', mimePrefixes: ['image/'] },
  { emoji: '🎵', mimePrefixes: ['audio/'] },
  { emoji: '🎞️', mimePrefixes: ['video/'] },
  {
    emoji: '💻',
    mimeTypes: [
      'application/javascript',
      'application/typescript',
      'text/css',
      'text/html',
      'text/javascript',
      'text/typescript',
    ],
    extensions: ['css', 'html', 'js', 'jsx', 'mjs', 'ts', 'tsx'],
  },
  {
    emoji: '🧾',
    mimeTypes: [
      'application/json',
      'application/ld+json',
      'application/x-ndjson',
    ],
    extensions: ['json', 'jsonl'],
  },
  {
    emoji: '📝',
    mimeTypes: ['text/markdown', 'text/plain'],
    extensions: ['md', 'mdx', 'txt'],
  },
  {
    emoji: '🧊',
    mimeTypes: [
      'model/gltf+json',
      'model/gltf-binary',
      'model/obj',
      'model/stl',
    ],
    extensions: ['glb', 'gltf', 'obj', 'stl'],
  },
  { emoji: '📕', mimeTypes: ['application/pdf'] },
  {
    emoji: '🗜️',
    mimeTypes: ['application/gzip', 'application/x-tar', 'application/zip'],
    extensions: ['gz', 'tar', 'tgz', 'zip'],
  },
]

export function fileIconForName(name: string): string {
  const mimeType = mime.getType(name)
  const extension = extensionFromName(name)
  const rule = fileIconMimeRules.find((item) =>
    matchesFileIconRule(item, mimeType, extension),
  )
  return rule?.emoji ?? defaultFileIcon
}

function matchesFileIconRule(
  rule: FileIconMimeRule,
  mimeType: string | null,
  extension: string,
): boolean {
  return (
    matchesMimeType(rule, mimeType) ||
    matchesMimePrefix(rule, mimeType) ||
    matchesExtension(rule, extension)
  )
}

function matchesMimeType(
  rule: FileIconMimeRule,
  mimeType: string | null,
): boolean {
  return mimeType !== null && (rule.mimeTypes?.includes(mimeType) ?? false)
}

function matchesMimePrefix(
  rule: FileIconMimeRule,
  mimeType: string | null,
): boolean {
  return (
    mimeType !== null &&
    (rule.mimePrefixes?.some((prefix) => mimeType.startsWith(prefix)) ?? false)
  )
}

function matchesExtension(rule: FileIconMimeRule, extension: string): boolean {
  return extension !== '' && (rule.extensions?.includes(extension) ?? false)
}

function extensionFromName(name: string): string {
  const extensionStart = name.lastIndexOf('.')
  return extensionStart === -1
    ? ''
    : name.slice(extensionStart + 1).toLowerCase()
}
