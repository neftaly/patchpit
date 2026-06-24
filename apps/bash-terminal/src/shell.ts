import { terminalHelpText } from './greeting.js'

export type TerminalEntryType = 'folder' | 'file'

export type TerminalEntry = {
  name: string
  type: TerminalEntryType
}

export type TerminalFileSystem = {
  rootName: string
  list: (path: readonly string[]) => Promise<readonly TerminalEntry[]>
  readFile: (path: readonly string[]) => Promise<string>
  writeFile: (
    path: readonly string[],
    content: string,
    options?: { append?: boolean },
  ) => Promise<void>
  makeDirectory: (path: readonly string[]) => Promise<void>
  touchFile: (path: readonly string[]) => Promise<void>
  remove: (path: readonly string[]) => Promise<void>
}

export type ShellOutputLine = { kind: 'output' | 'error'; text: string }

export type ShellCommandResult = {
  clear?: boolean
  cwd?: readonly string[]
  lines: readonly ShellOutputLine[]
}

type ParsedCommand = {
  argv: string[]
  redirect?: {
    append: boolean
    path: string
  }
}

export async function runShellCommand(
  fileSystem: TerminalFileSystem,
  cwd: readonly string[],
  command: string,
): Promise<ShellCommandResult> {
  const parsed = parseCommand(command)
  const [name, ...args] = parsed.argv
  if (!name) return { lines: [] }

  switch (name) {
    case 'clear':
      return { clear: true, lines: [] }
    case 'help':
      return textResult(terminalHelpText())
    case 'pwd':
      return textResult(displayPath(cwd))
    case 'ls':
      return textResult(await listPath(fileSystem, cwd, args[0] ?? '.'))
    case 'cd':
      return changeDirectory(fileSystem, cwd, args[0] ?? '/')
    case 'cat':
      return redirectableResult(
        fileSystem,
        cwd,
        parsed,
        await catFiles(fileSystem, cwd, args),
      )
    case 'echo':
      return redirectableResult(fileSystem, cwd, parsed, args.join(' '))
    case 'touch':
      return mutatePaths(fileSystem, cwd, args, fileSystem.touchFile)
    case 'mkdir':
      return mutatePaths(fileSystem, cwd, args, fileSystem.makeDirectory)
    case 'rm':
      return mutatePaths(fileSystem, cwd, args, fileSystem.remove)
    default:
      return { lines: [{ kind: 'error', text: `${name}: command not found` }] }
  }
}

export function displayPath(path: readonly string[]): string {
  return `/${path.join('/')}`
}

async function listPath(
  fileSystem: TerminalFileSystem,
  cwd: readonly string[],
  path: string,
): Promise<string> {
  const entries = await fileSystem.list(resolvePath(cwd, path))
  return entries
    .map((entry) => (entry.type === 'folder' ? `${entry.name}/` : entry.name))
    .join('\n')
}

async function changeDirectory(
  fileSystem: TerminalFileSystem,
  cwd: readonly string[],
  path: string,
): Promise<ShellCommandResult> {
  const nextCwd = resolvePath(cwd, path)
  await fileSystem.list(nextCwd)
  return { cwd: nextCwd, lines: [] }
}

async function catFiles(
  fileSystem: TerminalFileSystem,
  cwd: readonly string[],
  paths: readonly string[],
): Promise<string> {
  if (paths.length === 0) throw new Error('cat: missing file')
  const content = await Promise.all(
    paths.map((path) => fileSystem.readFile(resolvePath(cwd, path))),
  )
  return content.join('\n')
}

async function mutatePaths(
  fileSystem: TerminalFileSystem,
  cwd: readonly string[],
  paths: readonly string[],
  mutation: (path: readonly string[]) => Promise<void>,
): Promise<ShellCommandResult> {
  if (paths.length === 0) throw new Error('missing operand')
  for (const path of paths) {
    await mutation(resolvePath(cwd, path))
  }
  return { lines: [] }
}

async function redirectableResult(
  fileSystem: TerminalFileSystem,
  cwd: readonly string[],
  parsed: ParsedCommand,
  text: string,
): Promise<ShellCommandResult> {
  if (!parsed.redirect) return textResult(text)

  await fileSystem.writeFile(resolvePath(cwd, parsed.redirect.path), text, {
    append: parsed.redirect.append,
  })
  return { lines: [] }
}

function textResult(text: string | readonly string[]): ShellCommandResult {
  const body = typeof text === 'string' ? text : text.join('\n')
  return body
    ? { lines: [{ kind: 'output' as const, text: body }] }
    : { lines: [] }
}

function parseCommand(command: string): ParsedCommand {
  const tokens = tokenize(command)
  const redirectIndex = tokens.findIndex(
    (token) => token === '>' || token === '>>',
  )
  if (redirectIndex === -1) return { argv: tokens }

  const operator = tokens[redirectIndex]
  const redirectPath = tokens[redirectIndex + 1]
  if (!redirectPath) throw new Error(`${operator}: missing file`)
  if (tokens.length > redirectIndex + 2) {
    throw new Error(`${operator}: too many redirect targets`)
  }

  return {
    argv: tokens.slice(0, redirectIndex),
    redirect: { append: operator === '>>', path: redirectPath },
  }
}

function tokenize(command: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: '"' | "'" | null = null

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (!char) continue

    if (quote) {
      if (char === quote) quote = null
      else token += char
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === ' ' || char === '\t') {
      if (token) {
        tokens.push(token)
        token = ''
      }
      continue
    }

    if (char === '>') {
      if (token) {
        tokens.push(token)
        token = ''
      }
      if (command[index + 1] === '>') {
        tokens.push('>>')
        index += 1
      } else {
        tokens.push('>')
      }
      continue
    }

    token += char
  }

  if (quote) throw new Error(`unterminated ${quote} quote`)
  if (token) tokens.push(token)
  return tokens
}

function resolvePath(cwd: readonly string[], path: string): readonly string[] {
  const parts = path.startsWith('/') ? [] : [...cwd]
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts
}
