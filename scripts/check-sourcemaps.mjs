#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceMapComment = /(?:^|\n)\/\/# sourceMappingURL=(\S+)\s*$/

if (isDirectRun()) {
  const dist = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.cwd(), 'apps/patchpit-shell/dist')
  const result = await assertPublicSourceMaps({
    name: relativeDistPath(process.cwd(), dist),
    dist,
  })

  console.log(
    `${result.name} source maps ok (${result.jsCount} .js files, ${result.mapCount} .js.map files)`,
  )
}

export async function assertPublicSourceMaps(app) {
  try {
    await access(app.dist)
  } catch {
    throw new Error(`${app.name} dist is missing. Run pnpm build first.`)
  }

  const files = await listFiles(app.dist)
  const jsFiles = files.filter(
    (file) => file.endsWith('.js') && !file.endsWith('.js.map'),
  )
  const mapFiles = new Set(files.filter((file) => file.endsWith('.js.map')))
  const failures = []

  if (jsFiles.length === 0) {
    failures.push('missing .js files')
  }

  if (mapFiles.size === 0) {
    failures.push('missing .js.map files')
  }

  for (const jsFile of jsFiles) {
    const js = await readFile(jsFile, 'utf8')
    const match = js.match(sourceMapComment)

    if (!match) {
      failures.push(
        `missing sourceMappingURL comment: ${relativeDistPath(app.dist, jsFile)}`,
      )
      continue
    }

    const mapPath = resolveSourceMapPath(app.dist, jsFile, match[1])
    if (!mapPath || !mapFiles.has(mapPath)) {
      failures.push(
        `sourceMappingURL does not point to a dist .js.map file: ${relativeDistPath(
          app.dist,
          jsFile,
        )}`,
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${app.name} public source map check failed:\n${failures.join('\n')}`,
    )
  }

  return { name: app.name, jsCount: jsFiles.length, mapCount: mapFiles.size }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(filePath)))
    } else if (entry.isFile()) {
      files.push(filePath)
    }
  }

  return files
}

function resolveSourceMapPath(dist, jsFile, sourceMapUrl) {
  if (sourceMapUrl.startsWith('data:')) return null

  const [sourceMapPath] = sourceMapUrl.split(/[?#]/, 1)
  let decodedSourceMapPath
  try {
    decodedSourceMapPath = decodeURIComponent(sourceMapPath)
  } catch {
    return null
  }

  const resolved = path.resolve(path.dirname(jsFile), decodedSourceMapPath)
  return isInside(dist, resolved) ? resolved : null
}

function relativeDistPath(dist, filePath) {
  return path.relative(dist, filePath).split(path.sep).join('/') || '.'
}

function isInside(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

function isDirectRun() {
  return process.argv[1]
    ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
    : false
}
