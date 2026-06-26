import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  as,
  composeSources,
  defineSchema,
  eq,
  evaluate,
  from,
  fromIndexedObjectSource,
  fromObjectSource,
  id,
  leftJoin,
  maybe,
  pipe,
  project,
  ref,
  relation,
  string
} from '../packages/tarstate/src/index.js';

type Todo = {
  readonly id: string;
  readonly text: string;
};

type Assignment = {
  readonly todoId: string;
  readonly assignee: string;
};

type BenchRow = {
  readonly scenario: string;
  readonly rows: number;
  readonly source: string;
  readonly medianMs: string;
  readonly p95Ms: string;
  readonly maxMs: string;
  readonly rowsPerMs: string;
  readonly heapDeltaMb: string;
};

const schema = defineSchema({
  todos: relation<Todo>({
    key: 'id',
    fields: { id: id('todo'), text: string() }
  }),
  assignments: relation<Assignment>({
    key: 'todoId',
    fields: { todoId: ref('todos.id'), assignee: string() }
  })
});

const todo = as(schema.todos, 'todo');
const assignment = as(schema.assignments, 'assignment');
const todoRows = pipe(
  from(todo),
  leftJoin(from(assignment), eq(todo.id, assignment.todoId)),
  project({
    id: todo.id,
    text: todo.text,
    assignedTo: maybe(assignment.assignee)
  })
);

describe('tarstate ux benchmarks', () => {
  it('reports example app first-load bundle size', () => {
    const distRoot = path.resolve('apps/tarstate-example/dist');

    expect(existsSync(distRoot)).toBe(true);

    const jsFiles = readdirSync(path.join(distRoot, 'assets')).filter((fileName) => fileName.endsWith('.js'));
    const rows = jsFiles.map((fileName) => {
      const filePath = path.join(distRoot, 'assets', fileName);
      const source = readFileSync(filePath);

      return {
        file: fileName,
        kb: bytesToKb(statSync(filePath).size),
        gzipKb: bytesToKb(gzipSync(source).byteLength)
      };
    });

    console.table(rows);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('reports query latency, hitch size, and heap pressure', async () => {
    const rows: BenchRow[] = [];

    for (const size of [100, 1_000, 2_500, 5_000]) {
      rows.push(await benchHandJoin('todo assignment leftJoin', size));
      rows.push(await benchQuery('todo assignment leftJoin', size, 'scan', fromObjectSource));
      rows.push(await benchQuery('todo assignment leftJoin', size, 'indexed', fromIndexedObjectSource));
    }

    console.table(rows);
    expect(rows.every((row) => Number(row.medianMs) > 0)).toBe(true);
  }, 120_000);
});

async function benchQuery(
  scenario: string,
  rows: number,
  sourceName: string,
  sourceFactory: typeof fromObjectSource
): Promise<BenchRow> {
  const data = makeData(rows);
  const samples: Sample[] = [];

  for (let index = 0; index < (rows <= 1_000 ? 7 : 5); index += 1) {
    samples.push(await runOnce(data, sourceFactory));
  }

  const durations = samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const medianMs = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  const maxMs = Math.max(...durations);
  const heapDeltaMb = Math.max(...samples.map((sample) => sample.heapDeltaMb));

  return {
    scenario,
    rows,
    source: sourceName,
    medianMs: fixed(medianMs),
    p95Ms: fixed(p95Ms),
    maxMs: fixed(maxMs),
    rowsPerMs: fixed(rows / medianMs),
    heapDeltaMb: fixed(heapDeltaMb)
  };
}

async function benchHandJoin(scenario: string, rows: number): Promise<BenchRow> {
  const data = makeData(rows);
  const samples: Sample[] = [];

  for (let index = 0; index < (rows <= 1_000 ? 7 : 5); index += 1) {
    const beforeHeap = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = handJoin(data);
    const ms = performance.now() - start;
    const afterHeap = process.memoryUsage().heapUsed;

    expect(result).toHaveLength(rows);
    samples.push({ ms, heapDeltaMb: (afterHeap - beforeHeap) / 1024 / 1024 });
  }

  const durations = samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const medianMs = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  const maxMs = Math.max(...durations);
  const heapDeltaMb = Math.max(...samples.map((sample) => sample.heapDeltaMb));

  return {
    scenario,
    rows,
    source: 'hand lower bound',
    medianMs: fixed(medianMs),
    p95Ms: fixed(p95Ms),
    maxMs: fixed(maxMs),
    rowsPerMs: fixed(rows / medianMs),
    heapDeltaMb: fixed(heapDeltaMb)
  };
}

type Sample = {
  readonly ms: number;
  readonly heapDeltaMb: number;
};

async function runOnce(data: ReturnType<typeof makeData>, sourceFactory: typeof fromObjectSource): Promise<Sample> {
  const source = composeSources(sourceFactory({ todos: data.todos }), sourceFactory({ assignments: data.assignments }));
  const beforeHeap = process.memoryUsage().heapUsed;
  const start = performance.now();
  const result = await evaluate(source, todoRows);
  const ms = performance.now() - start;
  const afterHeap = process.memoryUsage().heapUsed;

  expect(result.rows).toHaveLength(data.todos.length);
  expect(result.diagnostics).toEqual([]);

  return {
    ms,
    heapDeltaMb: (afterHeap - beforeHeap) / 1024 / 1024
  };
}

function makeData(size: number): { readonly todos: readonly Todo[]; readonly assignments: readonly Assignment[] } {
  return {
    todos: Array.from({ length: size }, (_, index) => ({
      id: `todo-${index}`,
      text: `Todo ${index}`
    })),
    assignments: Array.from({ length: size }, (_, index) => ({
      todoId: `todo-${index}`,
      assignee: `Person ${index % 20}`
    }))
  };
}

function handJoin(data: ReturnType<typeof makeData>): { readonly id: string; readonly text: string; readonly assignedTo: string | undefined }[] {
  const assignmentsByTodoId = new Map(data.assignments.map((item) => [item.todoId, item.assignee]));

  return data.todos.map((item) => ({
    id: item.id,
    text: item.text,
    assignedTo: assignmentsByTodoId.get(item.id)
  }));
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(2);
}

function bytesToKb(value: number): string {
  return (value / 1024).toFixed(2);
}
