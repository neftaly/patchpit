import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertBenchResult,
  benchConfigFromEnv,
  runTerminalBenchInPage,
  withTerminalBenchPage,
} from './bench-harness.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = benchConfigFromEnv({ appRoot, env: process.env })
const results = []

for (let run = 0; run < config.repeat; run += 1) {
  const result = await withTerminalBenchPage(config, (page) =>
    page.evaluate(runTerminalBenchInPage, {
      burstLines: config.burstLines,
      followProbeLines: config.followProbeLines,
      lineCount: config.lineCount,
      probes: config.probes,
    }),
  )
  results.push(result)
}

const failures = results.flatMap((result, index) =>
  assertBenchResult(result).map((failure) => `run ${index + 1}: ${failure}`),
)

console.log(JSON.stringify(config.repeat === 1 ? results[0] : results, null, 2))

if (failures.length > 0) {
  console.error(`terminal bench failed:\n${failures.join('\n')}`)
  process.exit(1)
}
