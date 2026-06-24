import { defineSchema, defineApp, where, join, select, eq, primaryKey, unique, foreignKey } from './tarpit/index.js'

// ---------------------------------------------------------------------------
// Layer 1 — Essential State
// ---------------------------------------------------------------------------

export const schema = defineSchema({
  tasks: { id: '' as string, title: '' as string, done: false as boolean, userId: '' as string },
  users: { id: '' as string, name: '' as string },
})

// ---------------------------------------------------------------------------
// Layer 2 — Essential Logic
// ---------------------------------------------------------------------------

export const pending = where(schema.tasks, eq(schema.tasks.done, false))

export const tasksByUser = join(
  schema.tasks,
  schema.users,
  eq(schema.tasks.userId, schema.users.id),
)

export const pendingByUser = select(
  join(
    where(schema.tasks, eq(schema.tasks.done, false)),
    schema.users,
    eq(schema.tasks.userId, schema.users.id),
  ),
  'title', 'name',
)

const constraints = [
  primaryKey(schema.tasks.id),
  primaryKey(schema.users.id),
  unique(schema.users.name),
  foreignKey(eq(schema.tasks.userId, schema.users.id)),
] as const

// ---------------------------------------------------------------------------
// App spec — feeders use Immer producers; see useTodo for the hook.
//
// Feeders are declared here so the types flow through App<S, D, F>.
// The hook imports the app and passes it to createRuntime.
// ---------------------------------------------------------------------------

import { produce } from 'immer'

export type TaskRow = { id: string; title: string; done: boolean; userId: string }
export type UserRow = { id: string; name: string }
export type TodoDoc  = { tasks: TaskRow[]; users: UserRow[] }

export const app = defineApp({
  schema,
  derived: { pending, tasksByUser, pendingByUser },
  constraints,

  feeders: {
    addTask: (doc: TodoDoc, input: { title: string; userId: string }) =>
      produce(doc, d => {
        d.tasks.push({ id: crypto.randomUUID(), done: false, ...input })
      }),

    complete: (doc: TodoDoc, id: string) =>
      produce(doc, d => {
        const task = d.tasks.find(t => t.id === id)
        if (task) task.done = true
      }),

    addUser: (doc: TodoDoc, name: string) =>
      produce(doc, d => {
        d.users.push({ id: crypto.randomUUID(), name })
      }),
  },
})
