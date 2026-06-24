#!/usr/bin/env node
import { createServer } from 'node:http'
import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const root = process.cwd()
const apps = [
  {
    name: 'patchpit shell',
    dist: path.join(root, 'apps/patchpit-shell/dist'),
    port: 5410,
    expectedText: [
      'tiny-checkers',
      'w3c-logo.png',
      'DamagedHelmet.glb',
      'title: tiny-checkers',
    ],
  },
  {
    name: 'todo demo',
    dist: path.join(root, 'apps/todo-demo/dist'),
    port: 5420,
    expectedText: [
      'immer todo',
      "This todo uses Immer, so we can prove Automerge hasn't leaked into the core.",
    ],
  },
]

const servers = []

try {
  for (const app of apps) {
    await assertDist(app)
    servers.push(await serveStatic(app.dist, app.port))
  }

  const executablePath = findChromium()
  const browser = await chromium.launch({
    ...(executablePath && { executablePath }),
  })

  try {
    for (const app of apps) {
      await smokeApp(browser, app)
    }
  } finally {
    await browser.close()
  }
} finally {
  await Promise.all(servers.map((server) => closeServer(server)))
}

async function smokeApp(browser, app) {
  const page = await browser.newPage()
  const failures = []

  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text())
  })
  page.on('pageerror', (error) => failures.push(error.message))

  await page.goto(`http://127.0.0.1:${app.port}/`, {
    waitUntil: 'networkidle',
  })

  const bodyText = await page.locator('body').innerText()
  for (const expected of app.expectedText) {
    if (!bodyText.includes(expected)) {
      failures.push(`missing visible text: ${expected}`)
    }
  }

  await page.close()

  if (failures.length > 0) {
    throw new Error(`${app.name} smoke failed:\n${failures.join('\n')}`)
  }
}

async function assertDist(app) {
  try {
    await access(path.join(app.dist, 'index.html'))
  } catch {
    throw new Error(`${app.name} dist is missing. Run pnpm build first.`)
  }
}

function serveStatic(dir, port) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
    const pathname = decodeURIComponent(url.pathname)
    const filePath = safePath(dir, pathname === '/' ? '/index.html' : pathname)

    if (!filePath) {
      response.writeHead(403)
      response.end('forbidden')
      return
    }

    try {
      const fileStat = await stat(filePath)
      const body = await readFile(
        fileStat.isDirectory() ? path.join(filePath, 'index.html') : filePath,
      )
      response.writeHead(200, { 'content-type': contentType(filePath) })
      response.end(body)
    } catch {
      const fallback = await readFile(path.join(dir, 'index.html'))
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(fallback)
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}

function safePath(rootDir, pathname) {
  const resolved = path.resolve(rootDir, `.${pathname}`)
  return resolved.startsWith(path.resolve(rootDir)) ? resolved : null
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.wasm')) return 'application/wasm'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  }

  for (const command of ['chromium', 'chromium-browser', 'google-chrome']) {
    const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
    if (result.status === 0) return resolveCommand(command)
  }

  return undefined
}

function resolveCommand(command) {
  const result = spawnSync('command', ['-v', command], {
    encoding: 'utf8',
    shell: true,
  })
  return result.status === 0 ? result.stdout.trim() : command
}
