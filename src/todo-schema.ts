import { defineSchema, where, join, select, eq } from './tarpit/index.js'
import { produce } from 'immer'

type TaskRow = {
  id: string
  title: string
  done: boolean
  userId: string
}
type UserRow = { id: string; name: string }
export type TodoDoc = { tasks: TaskRow[]; users: UserRow[] }
type TodoShape = { tasks: TaskRow; users: UserRow }

const schema = defineSchema<TodoShape>({
  tasks: {
    id: '',
    title: '',
    done: false,
    userId: '',
  },
  users: { id: '', name: '' },
})

export const pending = where(schema.tasks, eq(schema.tasks.done, false))

export const pendingByUser = select(
  join(
    where(schema.tasks, eq(schema.tasks.done, false)),
    schema.users,
    eq(schema.tasks.userId, schema.users.id),
  ),
  'title',
  'name',
)

export const feeders = {
  addTask: (doc: TodoDoc, input: { title: string; userId: string }) =>
    produce(doc, (d) => {
      d.tasks.push({ id: crypto.randomUUID(), done: false, ...input })
    }),

  complete: (doc: TodoDoc, id: string) =>
    produce(doc, (d) => {
      const task = d.tasks.find((t) => t.id === id)
      if (task) task.done = true
    }),
}
