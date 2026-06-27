import { describe, expect, it } from 'vitest';
import {
  applyWrites,
  boolean as bool,
  defineSchema,
  id,
  number,
  ref,
  relation,
  string,
  write,
  type MutableObjectSourceData,
  type WritePatch
} from '../packages/tarstate/src/index.js';

type Todo = {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
  readonly priority: number;
};

type Assignment = {
  readonly todoId: string;
  readonly assignee: string;
  readonly status: string;
};

type BenchData = {
  readonly todos: readonly Todo[];
  readonly assignments: readonly Assignment[];
};

type Operation =
  | { readonly op: 'updateTodo'; readonly id: string; readonly changes: Partial<Todo> }
  | { readonly op: 'upsertAssignment'; readonly row: Assignment }
  | { readonly op: 'insertTodo'; readonly row: Todo }
  | { readonly op: 'deleteTodo'; readonly id: string };

type Scenario = {
  readonly rows: number;
  readonly patches: readonly Operation[];
  readonly tarstatePatches: readonly WritePatch[];
  readonly baseData: BenchData;
  readonly expectedTodoCount: number;
  readonly expectedAssignmentCount: number;
};

type Sample = {
  readonly ms: number;
  readonly heapDeltaMb: number;
};

type BenchRow = {
  readonly rows: number;
  readonly patches: number;
  readonly source: string;
  readonly medianMs: string;
  readonly p95Ms: string;
  readonly maxMs: string;
  readonly writesPerMs: string;
  readonly heapDeltaMb: string;
};

const schema = defineSchema({
  todos: relation<Todo>({
    key: 'id',
    fields: {
      id: id('todo'),
      text: string(),
      done: bool(),
      priority: number()
    }
  }),
  assignments: relation<Assignment>({
    key: 'todoId',
    fields: {
      todoId: ref('todos.id'),
      assignee: string(),
      status: string()
    }
  })
});

const todos = write(schema.todos);
const assignments = write(schema.assignments);

describe('tarstate write benchmarks', () => {
  it('reports object mutation versus tarstate write application', () => {
    const rows: BenchRow[] = [];

    for (const size of [100, 1_000, 5_000]) {
      const scenario = makeScenario(size);

      rows.push(benchHandMutation(scenario));
      rows.push(benchTarstateWrites(scenario));
    }

    console.table(rows);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => Number(row.maxMs) >= 0)).toBe(true);
  }, 120_000);
});

function benchHandMutation(scenario: Scenario): BenchRow {
  return bench('hand object mutation', scenario, () => {
    const data = cloneBenchData(scenario.baseData);
    handApply(data, scenario.patches);
    expect(data.todos).toHaveLength(scenario.expectedTodoCount);
    expect(data.assignments).toHaveLength(scenario.expectedAssignmentCount);
  });
}

function benchTarstateWrites(scenario: Scenario): BenchRow {
  return bench('tarstate applyWrites', scenario, () => {
    const data = cloneObjectSourceData(scenario.baseData);
    const result = applyWrites(data, scenario.tarstatePatches);

    expect(result).toEqual({
      patches: scenario.tarstatePatches.length,
      applied: scenario.tarstatePatches.length,
      diagnostics: []
    });
    expect(data.todos).toHaveLength(scenario.expectedTodoCount);
    expect(data.assignments).toHaveLength(scenario.expectedAssignmentCount);
  });
}

function bench(source: string, scenario: Scenario, run: () => void): BenchRow {
  const samples: Sample[] = [];
  const iterations = scenario.rows <= 1_000 ? 7 : 5;

  for (let index = 0; index < iterations; index += 1) {
    const beforeHeap = process.memoryUsage().heapUsed;
    const start = performance.now();
    run();
    const ms = performance.now() - start;
    const afterHeap = process.memoryUsage().heapUsed;

    samples.push({ ms, heapDeltaMb: (afterHeap - beforeHeap) / 1024 / 1024 });
  }

  const durations = samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const medianMs = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  const maxMs = Math.max(...durations);
  const heapDeltaMb = Math.max(...samples.map((sample) => sample.heapDeltaMb));

  return {
    rows: scenario.rows,
    patches: scenario.patches.length,
    source,
    medianMs: fixed(medianMs),
    p95Ms: fixed(p95Ms),
    maxMs: fixed(maxMs),
    writesPerMs: fixed(scenario.patches.length / Math.max(medianMs, 0.001)),
    heapDeltaMb: fixed(heapDeltaMb)
  };
}

function makeScenario(size: number): Scenario {
  const baseData = makeData(size);
  const updateCount = Math.floor(size * 0.3);
  const upsertCount = Math.floor(size * 0.2);
  const insertCount = Math.floor(size * 0.1);
  const deleteCount = Math.floor(size * 0.1);
  const patches: Operation[] = [];

  for (let index = 0; index < updateCount; index += 1) {
    patches.push({
      op: 'updateTodo',
      id: `todo-${index}`,
      changes: {
        text: `Updated todo ${index}`,
        done: index % 3 === 0,
        priority: index % 5
      }
    });
  }

  for (let index = 0; index < upsertCount; index += 1) {
    patches.push({
      op: 'upsertAssignment',
      row: {
        todoId: `todo-${index}`,
        assignee: `Person ${(index + 7) % 32}`,
        status: index % 2 === 0 ? 'active' : 'blocked'
      }
    });
  }

  for (let index = 0; index < insertCount; index += 1) {
    const idIndex = size + index;
    patches.push({
      op: 'insertTodo',
      row: {
        id: `todo-${idIndex}`,
        text: `Inserted todo ${idIndex}`,
        done: false,
        priority: idIndex % 5
      }
    });
  }

  for (let index = 0; index < deleteCount; index += 1) {
    patches.push({
      op: 'deleteTodo',
      id: `todo-${size - index - 1}`
    });
  }

  return {
    rows: size,
    patches,
    tarstatePatches: patches.map(toWritePatch),
    baseData,
    expectedTodoCount: size + insertCount - deleteCount,
    expectedAssignmentCount: size
  };
}

function toWritePatch(operation: Operation): WritePatch {
  switch (operation.op) {
    case 'updateTodo':
      return todos.update(operation.id, operation.changes);
    case 'upsertAssignment':
      return assignments.upsert(operation.row);
    case 'insertTodo':
      return todos.insert(operation.row);
    case 'deleteTodo':
      return todos.delete(operation.id);
  }
}

function handApply(data: { todos: Todo[]; assignments: Assignment[] }, patches: readonly Operation[]): void {
  const todoIndexes = new Map(data.todos.map((row, index) => [row.id, index]));
  const assignmentIndexes = new Map(data.assignments.map((row, index) => [row.todoId, index]));

  for (const patch of patches) {
    switch (patch.op) {
      case 'updateTodo':
        updateTodo(data.todos, todoIndexes, patch.id, patch.changes);
        break;
      case 'upsertAssignment':
        upsertAssignment(data.assignments, assignmentIndexes, patch.row);
        break;
      case 'insertTodo':
        insertTodo(data.todos, todoIndexes, patch.row);
        break;
      case 'deleteTodo':
        deleteTodo(data.todos, todoIndexes, patch.id);
        break;
    }
  }
}

function updateTodo(todosData: Todo[], indexes: Map<string, number>, idValue: string, changes: Partial<Todo>): void {
  const index = indexes.get(idValue);

  if (index === undefined) {
    throw new Error(`missing todo ${idValue}`);
  }

  const current = todosData[index];

  if (current === undefined) {
    throw new Error(`missing todo index ${index}`);
  }

  const next = { ...current, ...changes };

  if (next.id !== idValue && indexes.has(next.id)) {
    throw new Error(`duplicate todo ${next.id}`);
  }

  todosData[index] = next;
  indexes.delete(idValue);
  indexes.set(next.id, index);
}

function upsertAssignment(
  assignmentsData: Assignment[],
  indexes: Map<string, number>,
  row: Assignment
): void {
  const index = indexes.get(row.todoId);

  if (index === undefined) {
    indexes.set(row.todoId, assignmentsData.length);
    assignmentsData.push({ ...row });
  } else {
    assignmentsData[index] = { ...row };
  }
}

function insertTodo(todosData: Todo[], indexes: Map<string, number>, row: Todo): void {
  if (indexes.has(row.id)) {
    throw new Error(`duplicate todo ${row.id}`);
  }

  indexes.set(row.id, todosData.length);
  todosData.push({ ...row });
}

function deleteTodo(todosData: Todo[], indexes: Map<string, number>, idValue: string): void {
  const index = indexes.get(idValue);

  if (index === undefined) {
    throw new Error(`missing todo ${idValue}`);
  }

  todosData.splice(index, 1);
  indexes.delete(idValue);

  for (let nextIndex = index; nextIndex < todosData.length; nextIndex += 1) {
    const row = todosData[nextIndex];

    if (row !== undefined) {
      indexes.set(row.id, nextIndex);
    }
  }
}

function makeData(size: number): BenchData {
  return {
    todos: Array.from({ length: size }, (_, index) => ({
      id: `todo-${index}`,
      text: `Todo ${index}`,
      done: false,
      priority: index % 5
    })),
    assignments: Array.from({ length: size }, (_, index) => ({
      todoId: `todo-${index}`,
      assignee: `Person ${index % 32}`,
      status: index % 3 === 0 ? 'active' : 'queued'
    }))
  };
}

function cloneBenchData(data: BenchData): { todos: Todo[]; assignments: Assignment[] } {
  return {
    todos: data.todos.map((row) => ({ ...row })),
    assignments: data.assignments.map((row) => ({ ...row }))
  };
}

function cloneObjectSourceData(data: BenchData): MutableObjectSourceData {
  return cloneBenchData(data);
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(3);
}
