import { produce } from 'immer'
import { useState } from 'react'
import { useObjectQuery } from './tarstate-react.js'
import {
  defineSchema,
  eq,
  join,
  select,
  where,
} from './tarstate/index.js'

type User = {
  id: string
  name: string
}

type Task = {
  id: string
  title: string
  done: boolean
  assigneeId: string
}

type TodoDoc = {
  users: User[]
  tasks: Task[]
}

type TodoView = {
  pending: readonly Task[]
  pendingByUser: readonly { title: string; name: string }[]
}

const seedTodo: TodoDoc = {
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

const schema = defineSchema({
  users: { id: '', name: '' },
  tasks: { id: '', title: '', done: false, assigneeId: '' },
})

const pendingTasks = where(schema.tasks, eq(schema.tasks.done, false))
const pendingByUser = select(
  join(pendingTasks, schema.users, eq(schema.tasks.assigneeId, schema.users.id)),
  'title',
  'name',
)

export function ImmerTodoDemo() {
  const [doc, setDoc] = useState<TodoDoc>(seedTodo)
  const [draftTitle, setDraftTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState(seedTodo.users[0]?.id ?? '')
  const view = useTodoView(doc)

  function addTask() {
    const title = draftTitle.trim()
    if (!title || !assigneeId) return

    setDoc((current) =>
      produce(current, (draft) => {
        draft.tasks.push({
          id: `task-${Date.now()}`,
          title,
          done: false,
          assigneeId,
        })
      }),
    )
    setDraftTitle('')
  }

  function toggleTask(id: string) {
    setDoc((current) =>
      produce(current, (draft) => {
        const task = draft.tasks.find((item) => item.id === id)
        if (task) task.done = !task.done
      }),
    )
  }

  return (
    <main>
      <p>
        This todo uses Immer, so we can prove Automerge hasn't leaked into the
        core.
      </p>
      <h1>immer todo</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          addTask()
        }}
      >
        <input
          id="todo-title"
          name="todo-title"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="task"
        />
        <select
          id="todo-assignee"
          name="todo-assignee"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          {doc.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <button type="submit">add</button>
      </form>

      <h2>todos</h2>
      <ul>
        {doc.tasks.map((task) => (
          <li key={task.id}>
            <label>
              <input
                id={`todo-${task.id}`}
                name={`todo-${task.id}`}
                type="checkbox"
                checked={task.done}
                onChange={() => toggleTask(task.id)}
              />{' '}
              {task.title}
            </label>
          </li>
        ))}
      </ul>

      <h2>pending by assignee</h2>
      <ul>
        {view.pendingByUser.map((task) => (
          <li key={`${task.name}:${task.title}`}>
            {task.title}: {task.name}
          </li>
        ))}
      </ul>

      <h2>state</h2>
      <pre>{JSON.stringify({ doc, pending: view.pending }, null, 2)}</pre>
    </main>
  )
}

function useTodoView(doc: TodoDoc): TodoView {
  const pending = useObjectQuery(doc, pendingTasks)
  const pendingByUserResult = useObjectQuery(doc, pendingByUser)
  return {
    pending: pending.data,
    pendingByUser: pendingByUserResult.data,
  }
}
