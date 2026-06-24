export type User = {
  id: string
  name: string
}

export type Task = {
  id: string
  title: string
  done: boolean
  assigneeId: string
}

export type TodoDoc = {
  users: User[]
  tasks: Task[]
}

export const todoFixture: TodoDoc = {
  users: [
    { id: 'ada', name: 'Ada' },
    { id: 'grace', name: 'Grace' },
  ],
  tasks: [
    { id: 'task-1', title: 'sketch file tree', done: false, assigneeId: 'ada' },
    {
      id: 'task-2',
      title: 'separate automerge adapter',
      done: true,
      assigneeId: 'grace',
    },
    {
      id: 'task-3',
      title: 'prove plain object source',
      done: false,
      assigneeId: 'grace',
    },
  ],
}
