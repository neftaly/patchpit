#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = repoRoot()
const activeDir = path.join(root, '.claims', 'active')
const owner = process.env.CLAIMS_OWNER
const files = process.argv
  .slice(2)
  .filter((arg) => arg !== '--')
  .map(normalizeRepoPath)
const filesToCheck = files.length > 0 ? files : changedFiles()

function repoRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  return result.status === 0 ? result.stdout.trim() : process.cwd()
}

function gitLines(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    return []
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizeRepoPath)
}

function changedFiles() {
  return [
    ...new Set([
      ...gitLines(['diff', '--name-only', 'HEAD']),
      ...gitLines(['ls-files', '--others', '--exclude-standard']),
    ]),
  ]
}

function normalizeRepoPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function escapeRegex(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

function globToRegex(pattern) {
  let source = ''

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const next = pattern[index + 1]

    if (char === '*' && next === '*') {
      source += '.*'
      index += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else {
      source += escapeRegex(char)
    }
  }

  return new RegExp(`^${source}$`)
}

function matches(pattern, file) {
  const claimPattern = normalizeRepoPath(pattern)
  const repoFile = normalizeRepoPath(file)

  if (claimPattern === repoFile) {
    return true
  }

  if (claimPattern.endsWith('/**')) {
    const prefix = claimPattern.slice(0, -3)
    return repoFile === prefix || repoFile.startsWith(`${prefix}/`)
  }

  return claimPattern.includes('*') && globToRegex(claimPattern).test(repoFile)
}

function isActive(claim) {
  const expiresAt = Date.parse(claim.expires_at)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

function validateClaim(claim, filePath) {
  const required = [
    'protocol',
    'owner',
    'client',
    'task',
    'mode',
    'scope',
    'expires_at',
  ]
  const missing = required.filter((key) => claim[key] === undefined)
  const errors = missing.map(
    (key) => `${path.relative(root, filePath)} missing ${key}`,
  )

  if (claim.protocol !== undefined && claim.protocol !== 'repo-claims/v1') {
    errors.push(
      `${path.relative(root, filePath)} protocol must be repo-claims/v1`,
    )
  }

  if (
    claim.mode !== undefined &&
    claim.mode !== 'read' &&
    claim.mode !== 'edit'
  ) {
    errors.push(`${path.relative(root, filePath)} mode must be read or edit`)
  }

  if (
    claim.scope !== undefined &&
    (!Array.isArray(claim.scope) || claim.scope.length === 0)
  ) {
    errors.push(
      `${path.relative(root, filePath)} scope must be a non-empty array`,
    )
  }

  return errors
}

async function readActiveClaims() {
  const entries = await readdir(activeDir, { withFileTypes: true }).catch(
    () => [],
  )
  const claims = []
  const errors = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    const filePath = path.join(activeDir, entry.name)
    try {
      const claim = JSON.parse(await readFile(filePath, 'utf8'))
      errors.push(...validateClaim(claim, filePath))
      claims.push({ claim, filePath })
    } catch (error) {
      errors.push(
        `${path.relative(root, filePath)} invalid JSON: ${error.message}`,
      )
    }
  }

  return { claims, errors }
}

const { claims, errors } = await readActiveClaims()
const conflicts = []

for (const { claim, filePath } of claims) {
  if (claim.mode !== 'edit' || claim.owner === owner || !isActive(claim)) {
    continue
  }

  const overlaps = filesToCheck.filter((file) =>
    claim.scope.some((pattern) => matches(pattern, file)),
  )
  if (overlaps.length > 0) {
    conflicts.push({ claim, filePath, overlaps })
  }
}

for (const error of errors) {
  console.error(`claim error: ${error}`)
}

for (const conflict of conflicts) {
  console.error(
    `claim conflict: ${path.relative(root, conflict.filePath)} owned by ${conflict.claim.owner}/${conflict.claim.client}`,
  )
  console.error(`  task: ${conflict.claim.task}`)
  console.error(`  expires_at: ${conflict.claim.expires_at}`)
  for (const file of conflict.overlaps) {
    console.error(`  overlaps: ${file}`)
  }
}

if (errors.length > 0 || conflicts.length > 0) {
  process.exit(1)
}

console.log(
  `claims ok (${filesToCheck.length} file${filesToCheck.length === 1 ? '' : 's'} checked)`,
)
