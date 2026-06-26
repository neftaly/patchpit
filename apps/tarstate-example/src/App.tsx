import { useEffect, useState } from 'react';
import {
  as, evaluate, fromObjectSource, ref, from,
  eq, relation, composeSources, maybe, pipe,
  id, leftJoin, defineSchema, project, string,
} from '@patchpit/tarstate';

type TodoRow = {
  readonly id: string;
  readonly text: string;
  readonly assignedTo: string | undefined;
};

type TodoItem = {
  readonly id: string;
  readonly text: string;
};

type Assignment = {
  readonly todoId: string;
  readonly assignee: string;
};

const todos: readonly TodoItem[] = [
  { id: 'todo-a', text: 'Buy oat milk' },
  { id: 'todo-b', text: 'Water basil' }
];

const assignments: readonly Assignment[] = [
  { todoId: 'todo-a', assignee: 'Mina' }
];

// Define todo data and relationships.
const schema = defineSchema({
  todos: relation<{ id: string; text: string }>({
    key: 'id',
    fields: { id: id('todo'), text: string() }
  }),
  assignments: relation<{ todoId: string; assignee: string }>({
    key: 'todoId',
    fields: { todoId: ref('todos.id'), assignee: string() }
  })
});

const todo = as(schema.todos, 'todo');
const assignment = as(schema.assignments, 'assignment');

// Build the query.
const todoRows = pipe(
  from(todo), // => [{ todo: { id: 'todo-a', ... } }, { todo: { id: 'todo-b', ... } }]
  // leftJoin appends matches from another query.
  leftJoin(from(assignment), eq(todo.id, assignment.todoId)), // => [{ todo: { id: 'todo-a', ... }, assignment: { assignee: 'Mina', ... } }, { todo: { id: 'todo-b', ... } }]
  // project formats the results nicely.
  project({
    id: todo.id,
    text: todo.text,
    assignedTo: maybe(assignment.assignee)
  }) // => [{ id: 'todo-a', assignedTo: 'Mina', ... }, { id: 'todo-b', assignedTo: undefined, ... }]
);

// Run the query against the current data.
const loadTodos = async () => {
  // Pull in data from separate sources.
  const todoAppSource = fromObjectSource({ todos });
  const teamSource = fromObjectSource({ assignments });

  // Combine the sources for the query.
  const source = composeSources(todoAppSource, teamSource);

  return (await evaluate(source, todoRows)).rows;
};

function useAppQuery(loadRows: () => Promise<readonly TodoRow[]>): readonly TodoRow[] {
  const [rows, setRows] = useState<readonly TodoRow[]>();

  useEffect(() => {
    let current = true;

    void loadRows().then((nextRows) => {
      if (current) {
        setRows(nextRows);
      }
    });

    return () => {
      current = false;
    };
  }, [loadRows]);

  return rows ?? [];
}

export function App() {
  const todoRows = useAppQuery(loadTodos);

  return (
    <main>
      <h1>Tarstate Todos</h1>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <input aria-label={todo.text} disabled name={todo.id} readOnly value={todo.text} />
          </li>
        ))}
      </ul>
      <h2>Queried rows</h2>
      <ul>
        {todoRows.map((todo) => (
          <li key={todo.id}>
            {todo.text} is assigned to {todo.assignedTo ?? 'unassigned'}
          </li>
        ))}
      </ul>
    </main>
  );
}
