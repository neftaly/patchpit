import { chromium } from 'playwright'
import { createServer } from 'vite'

export const defaultProbeNames = [
  'key',
  'paste',
  'dispatch',
  'clip',
  'scroll',
  'resize',
  'follow',
  'burst',
]

export function benchConfigFromEnv({ appRoot, env }) {
  const probes = env.TERMINAL_BENCH_PROBES
    ? env.TERMINAL_BENCH_PROBES.split(',').map((probe) => probe.trim())
    : defaultProbeNames

  return {
    appRoot,
    burstLines: numberFromEnv(env.TERMINAL_BENCH_BURST_LINES, 1_000),
    chromiumExecutablePath: env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium',
    followProbeLines: numberFromEnv(env.TERMINAL_BENCH_FOLLOW_LINES, 25),
    lineCount: numberFromEnv(env.TERMINAL_BENCH_LINES, 10_000),
    origin: env.TERMINAL_BENCH_ORIGIN,
    probes,
    repeat: numberFromEnv(env.TERMINAL_BENCH_REPEAT, 1),
    routePath: '/scripts/bench-page.html',
  }
}

export async function withTerminalBenchPage(config, run) {
  const viteServer = await startTerminalBenchServer(config)
  const origin = terminalBenchOrigin(config, viteServer)
  const browser = await chromium.launch({
    executablePath: config.chromiumExecutablePath,
    headless: true,
  })

  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 720 },
    })
    await page.goto(`${origin}${config.routePath}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(() => window.__terminalBenchModules)
    return await run(page)
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

async function startTerminalBenchServer(config) {
  const serverOptions = terminalBenchServerOptions(config.origin)
  const server = await createServer({
    appType: 'mpa',
    root: config.appRoot,
    server: serverOptions,
  })
  await server.listen()
  return server
}

function terminalBenchServerOptions(origin) {
  if (!origin) {
    return { host: '127.0.0.1', port: 0 }
  }

  const url = new URL(origin)
  return {
    host: url.hostname,
    port: Number(url.port || defaultPortForProtocol(url.protocol)),
    strictPort: true,
  }
}

function terminalBenchOrigin(config, server) {
  if (config.origin) return config.origin
  const localUrl = server.resolvedUrls?.local[0]
  if (!localUrl) throw new Error('terminal bench server did not expose a URL')
  return localUrl.replace(/\/$/, '')
}

function defaultPortForProtocol(protocol) {
  return protocol === 'https:' ? 443 : 80
}

export async function runTerminalBenchInPage({
  burstLines,
  followProbeLines,
  lineCount,
  probes,
}) {
  window.__vite_plugin_react_preamble_installed__ = true
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type) => type

  const enabledProbes = new Set(probes)

  function stats(samples) {
    const sorted = [...samples].sort((a, b) => a - b)
    const sum = sorted.reduce((total, sample) => total + sample, 0)
    return {
      avgMs: sum / sorted.length,
      maxMs: sorted[sorted.length - 1],
      p50Ms: sorted[Math.floor(sorted.length * 0.5)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      p99Ms: sorted[Math.floor(sorted.length * 0.99)],
    }
  }

  async function probeBurst({ burstLines, render, rows }) {
    const burstStart = performance.now()
    const startId = rows.length
    for (let index = 0; index < burstLines; index += 1) {
      rows.push({
        id: startId + index,
        kind: 'output',
        text: `burst-${index}`,
      })
    }
    render()
    await settle()
    const ms = performance.now() - burstStart
    return {
      appendedRows: burstLines,
      ms,
      rowsPerSecond: Math.round((burstLines / ms) * 1000),
    }
  }

  async function probeDispatch({ form, input }) {
    const samples = []
    for (let index = 0; index < 50; index += 1) {
      setInputValue(input, `echo dispatch-${index}`)
      const started = performance.now()
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      samples.push(performance.now() - started)
      await nextFrame()
    }
    return stats(samples)
  }

  async function probeFollowMode({ followProbeLines, render, rows, scroll }) {
    scroll.scrollTop = Math.floor(scroll.scrollHeight * 0.25)
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
    await settle()
    const scrollTopBefore = scroll.scrollTop
    const startId = rows.length
    for (let index = 0; index < followProbeLines; index += 1) {
      rows.push({
        id: startId + index,
        kind: 'output',
        text: `follow-probe-${index}`,
      })
    }
    render()
    await settle()
    const scrollTopAfter = scroll.scrollTop
    return {
      appendedRows: followProbeLines,
      scrollDeltaPx: scrollTopAfter - scrollTopBefore,
      scrollTopAfter,
      scrollTopBefore,
    }
  }

  async function probeKeyInput(input) {
    const samples = []
    let value = ''
    for (let index = 0; index < 40; index += 1) {
      value += String.fromCharCode(97 + (index % 26))
      const started = performance.now()
      setInputValue(input, value)
      await nextFrame()
      samples.push(performance.now() - started)
    }
    return stats(samples)
  }

  async function probePaste(input) {
    const samples = []
    for (const size of [1_000, 10_000, 100_000]) {
      const started = performance.now()
      setInputValue(input, 'p'.repeat(size), 'insertFromPaste')
      await nextFrame()
      samples.push({ bytes: size, ms: performance.now() - started })
    }
    return samples
  }

  async function probeOutputClipping({ render, rows, scroll }) {
    rows.push({
      id: rows.length,
      kind: 'output',
      text: 'output-clipping-probe '.repeat(12),
    })
    render()
    await settle()
    scroll.scrollLeft = scroll.scrollWidth

    const outputRows = Array.from(
      document.querySelectorAll('.terminal-line-output'),
    ).map((line) => {
      const row = line.closest('.terminal-virtual-row')
      return {
        lineScrollHeight: line.scrollHeight,
        rowClientHeight: row?.clientHeight ?? 0,
        rowScrollHeight: row?.scrollHeight ?? 0,
        whiteSpace: getComputedStyle(line).whiteSpace,
      }
    })
    const maxVerticalOverflowPx = Math.max(
      0,
      ...outputRows.map((row) => row.rowScrollHeight - row.rowClientHeight),
    )
    return {
      horizontalScrollLeft: scroll.scrollLeft,
      horizontalScrollWidth: scroll.scrollWidth,
      maxVerticalOverflowPx,
      rows: outputRows.length,
      whiteSpaceValues: [...new Set(outputRows.map((row) => row.whiteSpace))],
    }
  }

  async function probeResize(rootElement) {
    const samples = []
    for (const height of [420, 760, 500, 720]) {
      const started = performance.now()
      rootElement.style.height = `${height}px`
      window.dispatchEvent(new Event('resize'))
      await settle()
      samples.push(performance.now() - started)
    }
    return stats(samples)
  }

  async function probeScroll(scroll) {
    const samples = []
    for (let index = 0; index < 40; index += 1) {
      const started = performance.now()
      scroll.scrollTop = Math.floor((index / 39) * scroll.scrollHeight)
      scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
      await nextFrame()
      samples.push(performance.now() - started)
    }
    return stats(samples)
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve))
  }

  async function settle() {
    await nextFrame()
    await nextFrame()
  }

  function setInputValue(input, value, inputType = 'insertText') {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set
    setter.call(input, value)
    input.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: value.slice(-1),
        inputType,
      }),
    )
  }

  const { React, ReactDomClient, terminalModule } =
    window.__terminalBenchModules
  const terminalRowHeightPx =
    terminalModule.defaultTerminalViewportSettings.rowHeightPx

  const style = document.createElement('style')
  style.textContent = `
    html, body, #terminal-bench-root { width: 100%; height: 100%; margin: 0; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .terminal-bench-host pre { padding: 12px; border: 1px solid red; white-space: pre-wrap; }
    .terminal-pane { display: flex; height: 100%; }
    .terminal-output { flex: 1; overflow: auto; padding: 8px; position: relative; }
    .terminal-line, .terminal-input-row { display: flex; gap: 8px; height: ${terminalRowHeightPx}px; line-height: ${terminalRowHeightPx}px; margin: 0; white-space: pre; }
    .terminal-line-output, .terminal-line-error { display: block; }
    .terminal-line-text { display: inline-block; min-width: max-content; white-space: pre; }
    .terminal-input-row input { flex: 1; border: 0; outline: 0; font: inherit; }
    .terminal-follow-button { position: fixed; right: 12px; bottom: 12px; }
  `
  document.head.append(style)

  const rootElement = document.getElementById('terminal-bench-root')
  rootElement.className = 'terminal-bench-host'
  const root = ReactDomClient.createRoot(rootElement)
  const rows = Array.from({ length: lineCount }, (_, index) => ({
    id: index,
    kind: 'output',
    text: `row-${index}`,
  }))
  let submitted = ''

  function render() {
    root.render(
      React.default.createElement(terminalModule.TerminalViewport, {
        isRunning: false,
        lineAt: (index) => rows[index],
        lineCount: rows.length,
        onCommand: (command) => {
          submitted = command
        },
        prompt: 'bench:/$',
        title: 'terminal bench',
      }),
    )
  }

  const heapBefore = performance.memory?.usedJSHeapSize
  const mountStart = performance.now()
  render()
  await settle()
  const mountMs = performance.now() - mountStart

  const scroll = document.querySelector('.terminal-output')
  const input = document.querySelector('input[aria-label="bash command"]')
  const form = input?.closest('form')
  if (!scroll || !input || !form)
    return { error: 'terminal prompt not visible' }

  const result = { mountMs }
  if (enabledProbes.has('key')) result.key = await probeKeyInput(input)
  if (enabledProbes.has('paste')) result.paste = await probePaste(input)
  if (enabledProbes.has('dispatch')) {
    result.dispatch = await probeDispatch({ form, input })
  }
  if (enabledProbes.has('clip')) {
    result.outputClipping = await probeOutputClipping({ render, rows, scroll })
  }
  if (enabledProbes.has('scroll')) result.scroll = await probeScroll(scroll)
  if (enabledProbes.has('resize')) {
    result.resize = await probeResize(rootElement)
  }
  if (enabledProbes.has('follow')) {
    result.followMode = await probeFollowMode({
      followProbeLines,
      render,
      rows,
      scroll,
    })
  }
  if (enabledProbes.has('burst')) {
    result.burst = await probeBurst({ burstLines, render, rows })
  }

  const heapAfter = performance.memory?.usedJSHeapSize
  const expectedVirtualHeight = (rows.length + 1) * terminalRowHeightPx
  result.dom = {
    expectedVirtualHeight,
    followButtonVisible: Boolean(
      document.querySelector('.terminal-follow-button'),
    ),
    lineNodes: document.querySelectorAll('.terminal-line').length,
    promptVisible: Boolean(
      document.querySelector('input[aria-label="bash command"]'),
    ),
    virtualHeight: document
      .querySelector('.terminal-virtual-content')
      .getBoundingClientRect().height,
  }
  result.heap = {
    afterBytes: heapAfter,
    beforeBytes: heapBefore,
    deltaBytes:
      typeof heapBefore === 'number' && typeof heapAfter === 'number'
        ? heapAfter - heapBefore
        : undefined,
  }
  result.rows = rows.length
  result.submitted = submitted
  return result
}

export function assertBenchResult(result) {
  const failures = []
  if (result.error) failures.push(result.error)
  if (result.dom?.lineNodes > 200) {
    failures.push(`too many terminal DOM rows: ${result.dom.lineNodes}`)
  }
  if (
    result.dom &&
    !result.dom.promptVisible &&
    !result.dom.followButtonVisible
  ) {
    failures.push('prompt is not reachable after probes')
  }
  if (
    result.dom &&
    Math.abs(result.dom.virtualHeight - result.dom.expectedVirtualHeight) > 1
  ) {
    failures.push(
      `virtual height ${result.dom.virtualHeight}px did not match expected ${result.dom.expectedVirtualHeight}px`,
    )
  }
  if (result.outputClipping?.maxVerticalOverflowPx > 1) {
    failures.push(
      `output rows overflowed virtual row height by ${result.outputClipping.maxVerticalOverflowPx}px`,
    )
  }
  if (
    result.outputClipping &&
    result.outputClipping.horizontalScrollWidth <=
      result.outputClipping.horizontalScrollLeft
  ) {
    failures.push('long output did not expose horizontal scroll range')
  }
  if (result.followMode && result.followMode.scrollDeltaPx !== 0) {
    failures.push(
      `follow mode moved scrolled-away viewport by ${result.followMode.scrollDeltaPx}px`,
    )
  }
  return failures
}

function numberFromEnv(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
