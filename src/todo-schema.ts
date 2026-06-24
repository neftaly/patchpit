import { defineSchema, all, where, join, select, eq } from './tarstate/index.js'

export type TaskRow = {
  id: string
  title: string
  done: boolean
  userId: string
}
export type UserRow = { id: string; name: string }
export type TaskDoc = { src: string[]; tasks: TaskRow[] }
export type UserDoc = { users: UserRow[] }
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

export const users = all(schema.users)

export const pendingByUser = select(
  join(
    where(schema.tasks, eq(schema.tasks.done, false)),
    schema.users,
    eq(schema.tasks.userId, schema.users.id),
  ),
  'title',
  'name',
)

export const todoQueries = {
  pending,
  pendingByUser,
  users,
}
