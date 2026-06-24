import type { QB, Doc } from './index.js'
import {
  defineSchema,
  defineApp,
  createRuntime,
  evaluate,
  where,
  join,
  select,
  eq,
  lt,
  and,
  not,
} from './index.js'

type TaskRow = { id: string; title: string; done: boolean; userId: string }
type UserRow = { id: string; name: string }
type ExampleDoc = { tasks: TaskRow[]; users: UserRow[] }
type ExampleShape = { tasks: TaskRow; users: UserRow }

const schema = defineSchema<ExampleShape>({
  tasks: {
    id: '',
    title: '',
    done: false,
    userId: '',
  },
  users: { id: '', name: '' },
})

const pending = where(schema.tasks, eq(schema.tasks.done, false))

const tasksByUser = join(
  schema.tasks,
  schema.users,
  eq(schema.tasks.userId, schema.users.id),
)

const pendingByUser = select(
  join(
    where(schema.tasks, eq(schema.tasks.done, false)),
    schema.users,
    eq(schema.tasks.userId, schema.users.id),
  ),
  'title',
  'name',
)

const complex = where(
  schema.tasks,
  and(eq(schema.tasks.done, false), not(eq(schema.tasks.title, ''))),
)

const withUser = <T extends Record<string, string | boolean | number | null>>(
  qb: QB<T, 'tasks'>,
) => join(qb, schema.users, eq(schema.tasks.userId, schema.users.id))

const allByUser = withUser(schema.tasks)
const urgentByUser = withUser(where(schema.tasks, lt(schema.tasks.title, 'z')))

const app = defineApp({
  derived: {
    pending,
    tasksByUser,
    pendingByUser,
    complex,
    allByUser,
    urgentByUser,
  },

  feeders: {
    addTask: (doc: ExampleDoc, input: { title: string; userId: string }) => ({
      ...doc,
      tasks: [
        ...doc.tasks,
        { id: `t${doc.tasks.length + 1}`, done: false, ...input },
      ],
    }),
    complete: (doc: ExampleDoc, id: string) => ({
      ...doc,
      tasks: doc.tasks.map((t) => (t.id === id ? { ...t, done: true } : t)),
    }),
    addUser: (doc: ExampleDoc, input: { name: string }) => ({
      ...doc,
      users: [...doc.users, { id: `u${doc.users.length + 1}`, ...input }],
    }),
  },
})

const rt = createRuntime(app, {
  tasks: [
    { id: 't1', title: 'buy oat milk', done: false, userId: 'u1' },
    { id: 't2', title: 'read OOTTP', done: true, userId: 'u1' },
  ],
  users: [{ id: 'u1', name: 'alice' }],
})

const snapshot = rt.query('pending')
void snapshot[0]?.title

rt.dispatch('addUser', { name: 'bob' })
rt.dispatch('addTask', { title: 'write tests', userId: 'u2' })

rt.dispatch('complete', 't1')

const doc: Doc = {
  tasks: [
    { id: 't1', title: 'buy oat milk', done: false, userId: 'u1' },
    { id: 't2', title: 'read OOTTP', done: true, userId: 'u1' },
    { id: 't3', title: 'write tests', done: false, userId: 'u2' },
  ],
  users: [
    { id: 'u1', name: 'alice' },
    { id: 'u2', name: 'bob' },
  ],
}

const pendingRows = evaluate(pending, doc)
const byUserRows = evaluate(tasksByUser, doc)
const pendingByURows = evaluate(pendingByUser, doc)

void pendingRows[0]?.title
void byUserRows[0]?.name
void pendingByURows[0]?.title
