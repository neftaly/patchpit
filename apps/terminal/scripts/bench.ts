import { performance } from 'node:perf_hooks';
import { Bash, InMemoryFs, MountableFs, type IFileSystem } from 'just-bash/browser';
import { createSeedFilesystem } from '@patchpit/system';
import { PatchpitFs } from '../src/patchpit-fs';

type Mode = 'memory' | 'patchpit';
type Sample = {
  kind: string;
  ms: number;
};

const runs = Number.parseInt(process.env.RUNS ?? '250', 10);
const warmup = Number.parseInt(process.env.WARMUP ?? '25', 10);
const seed = Number.parseInt(process.env.SEED ?? '1', 10);
const mode = process.env.MODE ?? 'both';

void main();

async function main(): Promise<void> {
  const commands = Array.from({ length: runs + warmup }, (_, index) => fuzzCommand(index, mulberry32(seed + index)));
  const modes: Mode[] = mode === 'memory' || mode === 'patchpit' ? [mode] : ['memory', 'patchpit'];
  const results = Object.fromEntries(await Promise.all(modes.map(async (benchMode) => [
    benchMode,
    await benchmark(benchMode, commands),
  ])));

  console.log(JSON.stringify({
    overhead: results.memory === undefined || results.patchpit === undefined
      ? undefined
      : {
          mean: results.patchpit.latencyMs.mean / results.memory.latencyMs.mean,
          p95: results.patchpit.latencyMs.p95 / results.memory.latencyMs.p95,
        },
    results,
    runs,
    seed,
    warmup,
  }, null, 2));
}

async function benchmark(benchMode: Mode, commandPlan: readonly ReturnType<typeof fuzzCommand>[]) {
  const bash = createBash(benchMode);
  await bash.exec('ls >/dev/null', { cwd: '/home' });

  for (const { command } of commandPlan.slice(0, warmup)) {
    await bash.exec(command, { cwd: '/home' });
  }

  const samples: Sample[] = [];
  const heapBefore = heapUsed();
  for (const { command, kind } of commandPlan.slice(warmup)) {
    const start = performance.now();
    const result = await bash.exec(command, { cwd: '/home' });
    const ms = performance.now() - start;
    if (result.exitCode > 1) throw new Error(`command failed: ${command}\n${result.stderr}`);
    samples.push({ kind, ms });
  }
  const heapAfter = heapUsed();

  return {
    byCommand: Object.fromEntries([...new Set(samples.map((sample) => sample.kind))].map((kind) => [
      kind,
      summarize(samples.filter((sample) => sample.kind === kind).map((sample) => sample.ms)),
    ])),
    heapDelta: heapAfter - heapBefore,
    latencyMs: summarize(samples.map((sample) => sample.ms)),
  };
}

function createBash(benchMode: Mode): Bash {
  return new Bash({
    env: { HOME: '/home' },
    fs: benchmarkFs(benchMode === 'memory' ? memoryFs() : patchpitFs()),
    network: { allowedUrlPrefixes: ['https://example.test'] },
    fetch: async (url) => ({
      body: new TextEncoder().encode(`fixture ${url}\n`),
      headers: { 'content-type': 'text/plain' },
      status: 200,
      statusText: 'OK',
      url,
    }),
  });
}

function benchmarkFs(base: IFileSystem): MountableFs {
  const fs = new MountableFs({ base });
  fs.mount('/dev', deviceFs());
  return fs;
}

function memoryFs(): IFileSystem {
  return new InMemoryFs({
    '/home/README.md': '# Home\n',
    '/home/data.json': '{"ok":true}\n',
  });
}

function deviceFs(): IFileSystem {
  const fs = new InMemoryFs();
  for (const name of ['full', 'null', 'stderr', 'stdin', 'stdout', 'zero']) {
    fs.writeFileSync(`/${name}`, '');
  }
  return fs;
}

function patchpitFs(): IFileSystem {
  const seedFilesystem = createSeedFilesystem();
  return new PatchpitFs({
    documentHandles: seedFilesystem.documentHandles,
    indexHandle: seedFilesystem.indexHandle,
    repo: seedFilesystem.repo,
    rootUrl: seedFilesystem.rootUrl,
  });
}

function fuzzCommand(index: number, next: () => number) {
  const file = `fuzz-${index % 17}.txt`;
  const dir = `dir-${index % 7}`;
  const text = shellQuote(word(next));
  return [
    { kind: 'write', command: `echo ${text} > ${file}` },
    { kind: 'read', command: `echo ${text} > ${file} && cat ${file} | wc -c` },
    { kind: 'append', command: `touch ${file} && printf '%s\\n' ${text} >> ${file}` },
    { kind: 'grep', command: `echo ${text} > ${file} && grep -n . ${file} >/dev/null` },
    { kind: 'copy', command: `echo ${text} > ${file} && mkdir -p ${dir} && cp ${file} ${dir}/copy.txt` },
    { kind: 'find', command: `find . -name '*.txt' | sort | head -5` },
    { kind: 'network', command: `curl -s https://example.test/${index % 5} >/dev/null` },
  ][Math.floor(next() * 7)];
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    max: sorted.at(-1),
    mean: sorted.reduce((sum, ms) => sum + ms, 0) / sorted.length,
    min: sorted.at(0),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function word(next: () => number): string {
  return Array.from({ length: 1 + Math.floor(next() * 12) }, () => (
    'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(next() * 36)]
  )).join('');
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function percentile(values: readonly number[], percentileValue: number): number | undefined {
  return values[Math.min(values.length - 1, Math.floor(values.length * percentileValue))];
}

function heapUsed(): number {
  globalThis.gc?.();
  return process.memoryUsage().heapUsed;
}

function mulberry32(seedValue: number) {
  return () => {
    seedValue |= 0;
    seedValue = seedValue + 0x6D2B79F5 | 0;
    let value = Math.imul(seedValue ^ seedValue >>> 15, 1 | seedValue);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
