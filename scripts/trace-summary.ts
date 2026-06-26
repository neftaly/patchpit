import { readFileSync, statSync } from 'node:fs';

type TraceEvent = {
  readonly args?: {
    readonly name?: string;
  };
  readonly dur?: number;
  readonly name?: string;
  readonly ph?: string;
  readonly pid?: number;
  readonly tid?: number;
  readonly ts?: number;
};

type TraceFile = {
  readonly traceEvents?: readonly TraceEvent[];
};

type ThreadSummary = {
  count: number;
  readonly process: string;
  readonly thread: string;
  totalMs: number;
};

type TimingSummary = {
  count: number;
  maxMs: number;
  minMs: number;
  totalMs: number;
};

const paths = process.argv.slice(2);

if (paths.length === 0) {
  throw new Error('Usage: pnpm trace:summary trace.json [...trace.json]');
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

for (const path of paths) {
  const trace = JSON.parse(readFileSync(path, 'utf8')) as TraceFile;
  const events = trace.traceEvents ?? [];
  const processNames = new Map<number, string>();
  const threadNames = new Map<string, string>();

  for (const event of events) {
    if (event.ph === 'M' && event.name === 'process_name' && event.pid !== undefined) {
      processNames.set(event.pid, event.args?.name ?? String(event.pid));
    }
    if (
      event.ph === 'M' &&
      event.name === 'thread_name' &&
      event.pid !== undefined &&
      event.tid !== undefined
    ) {
      threadNames.set(`${event.pid}:${event.tid}`, event.args?.name ?? String(event.tid));
    }
  }

  const threads = new Map<string, ThreadSummary>();
  const gltfTimings = new Map<string, TimingSummary>();
  const openGltfTimings = new Map<string, number[]>();

  const addGltfTiming = (name: string, durationMs: number): void => {
    const timing = gltfTimings.get(name) ?? {
      count: 0,
      maxMs: 0,
      minMs: Number.POSITIVE_INFINITY,
      totalMs: 0,
    };

    timing.count += 1;
    timing.maxMs = Math.max(timing.maxMs, durationMs);
    timing.minMs = Math.min(timing.minMs, durationMs);
    timing.totalMs += durationMs;
    gltfTimings.set(name, timing);
  };

  for (const event of events) {
    if (
      event.name?.startsWith('royal:renderer:gltf:') === true &&
      event.ts !== undefined
    ) {
      if (event.ph === 'b') {
        const timings = openGltfTimings.get(event.name) ?? [];
        timings.push(event.ts);
        openGltfTimings.set(event.name, timings);
      } else if (event.ph === 'e') {
        const timings = openGltfTimings.get(event.name);
        const start = timings?.pop();
        if (start !== undefined) addGltfTiming(event.name, (event.ts - start) / 1000);
      } else if (
        event.ph === 'I' &&
        !event.name.endsWith(':start') &&
        !event.name.endsWith(':end')
      ) {
        addGltfTiming(event.name, 0);
      }
    }

    if (
      event.pid === undefined ||
      event.tid === undefined ||
      event.dur === undefined
    ) {
      continue;
    }

    const key = `${event.pid}:${event.tid}`;
    const summary = threads.get(key) ?? {
      count: 0,
      process: processNames.get(event.pid) ?? String(event.pid),
      thread: threadNames.get(key) ?? String(event.tid),
      totalMs: 0,
    };

    summary.count += 1;
    summary.totalMs += event.dur / 1000;
    threads.set(key, summary);
  }

  const topThreads = [...threads.values()]
    .sort((left, right) => right.totalMs - left.totalMs)
    .slice(0, 8)
    .map((thread) => ({
      ...thread,
      totalMs: round(thread.totalMs),
    }));
  const gltfReadiness = [...gltfTimings.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, timing]) => ({
      avgMs: round(timing.totalMs / timing.count),
      count: timing.count,
      maxMs: round(timing.maxMs),
      minMs: round(timing.minMs === Number.POSITIVE_INFINITY ? 0 : timing.minMs),
      name,
      totalMs: round(timing.totalMs),
    }));

  console.log(JSON.stringify({
    bytes: statSync(path).size,
    events: events.length,
    gltfReadiness,
    path,
    topThreads,
  }, null, 2));
}
