import { defineSchema, all, where, join, select, eq } from './tarstate/index.js'

export type Task = {
  id: string
  title: string
  done: boolean
  assigneeId: string
}
export type User = { id: string; name: string }
export type TasksDoc = { userSources: string[]; tasks: Task[] }
export type UsersDoc = { users: User[] }
export const taskUserSourcesField = 'userSources' satisfies keyof TasksDoc
type TodoShape = { tasks: Task; users: User }

const schema = defineSchema<TodoShape>({
  tasks: {
    id: '',
    title: '',
    done: false,
    assigneeId: '',
  },
  users: { id: '', name: '' },
})

export const pending = where(schema.tasks, eq(schema.tasks.done, false))

export const users = all(schema.users)

export const pendingByUser = select(
  join(
    where(schema.tasks, eq(schema.tasks.done, false)),
    schema.users,
    eq(schema.tasks.assigneeId, schema.users.id),
  ),
  'title',
  'name',
)

export const todoQueries = {
  pending,
  pendingByUser,
  users,
}
