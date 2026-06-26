import { PerformanceObserver } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  as,
  composeSources,
  defineSchema,
  eq,
  evaluate,
  from,
  fromIndexedObjectSource,
  id,
  leftJoin,
  maybe,
  pipe,
  project,
  ref,
  relation,
  string
} from '../packages/tarstate/src/index.js';

type Todo = { readonly id: string; readonly text: string };
type Assignment = { readonly todoId: string; readonly assignee: string };

const schema = defineSchema({
  todos: relation<Todo>({ key: 'id', fields: { id: id('todo'), text: string() } }),
  assignments: relation<Assignment>({ key: 'todoId', fields: { todoId: ref('todos.id'), assignee: string() } })
});

const todo = as(schema.todos, 'todo');
const assignment = as(schema.assignments, 'assignment');
const todoRows = pipe(
  from(todo),
  leftJoin(from(assignment), eq(todo.id, assignment.todoId)),
  project({ id: todo.id, text: todo.text, assignedTo: maybe(assignment.assignee) })
);

describe('tarstate memory pressure', () => {
  it('reports retained heap and observed gc while repeatedly evaluating indexed joins', async () => {
    const data = makeData(5_000);
    const handRows = handJoin(data);
    const source = composeSources(
      fromIndexedObjectSource({ todos: data.todos }),
      fromIndexedObjectSource({ assignments: data.assignments })
    );
    const gcEvents: { kind: number; duration: number }[] = [];
    const observer = new PerformanceObserver((items) => {
      for (const item of items.getEntries()) {
        gcEvents.push({ kind: (item as { kind?: number }).kind ?? 0, duration: item.duration });
      }
    });

    observer.observe({ entryTypes: ['gc'] });
    forceGc();
    expect(handRows).toHaveLength(5_000);
    const handBefore = process.memoryUsage().heapUsed;
    const handSamples: number[] = [];

    for (let index = 0; index < 100; index += 1) {
      const start = performance.now();
      const result = handJoin(data);
      handSamples.push(performance.now() - start);
      expect(result).toHaveLength(5_000);
    }

    forceGc();
    const handAfter = process.memoryUsage().heapUsed;
    const before = process.memoryUsage().heapUsed;
    const samples: number[] = [];

    for (let index = 0; index < 100; index += 1) {
      const start = performance.now();
      const result = await evaluate(source, todoRows);
      samples.push(performance.now() - start);
      expect(result.rows).toHaveLength(5_000);
    }

    forceGc();
    observer.disconnect();
    const after = process.memoryUsage().heapUsed;
    const sorted = [...samples].sort((left, right) => left - right);
    const handSorted = [...handSamples].sort((left, right) => left - right);
    const gcMs = gcEvents.reduce((total, event) => total + event.duration, 0);

    console.table([
      memoryRow('hand lower bound', handSorted, handSamples, handAfter - handBefore, 0, 0),
      memoryRow('tarstate indexed', sorted, samples, after - before, gcEvents.length, gcMs)
    ]);
  }, 120_000);
});

function memoryRow(
  source: string,
  sorted: readonly number[],
  samples: readonly number[],
  retainedHeap: number,
  observedGcEvents: number,
  observedGcMs: number
) {
  return {
    source,
    iterations: 100,
    rows: 5_000,
    medianMs: fixed(percentile(sorted, 0.5)),
    p95Ms: fixed(percentile(sorted, 0.95)),
    maxMs: fixed(Math.max(...samples)),
    retainedHeapMb: fixed(retainedHeap / 1024 / 1024),
    observedGcEvents,
    observedGcMs: fixed(observedGcMs)
  };
}

function makeData(size: number): { readonly todos: readonly Todo[]; readonly assignments: readonly Assignment[] } {
  return {
    todos: Array.from({ length: size }, (_, index) => ({ id: `todo-${index}`, text: `Todo ${index}` })),
    assignments: Array.from({ length: size }, (_, index) => ({ todoId: `todo-${index}`, assignee: `Person ${index % 20}` }))
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

function forceGc(): void {
  if (globalThis.gc === undefined) {
    throw new Error('Run this benchmark with node --expose-gc.');
  }

  globalThis.gc();
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(2);
}
