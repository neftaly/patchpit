import { produce } from 'immer'
import { useState } from 'react'
import { useObjectQuery } from '@patchpit/tarstate-react'
import {
  defineSchema,
  eq,
  from,
  join,
  project,
  relation,
  where,
} from '@patchpit/tarstate/query'
import { todoFixture } from './fixture.js'
import type { Task, TodoDoc } from './fixture.js'

type TodoView = {
  pending: readonly Task[]
  pendingByUser: readonly { title: string; name: string }[]
}

const schema = defineSchema({
  users: relation({ key: 'id', fields: { id: '', name: '' } }),
  tasks: relation({
    key: 'id',
    fields: { id: '', title: '', done: false, assigneeId: '' },
  }),
})

const pendingTasks = where(from(schema.tasks), eq(schema.tasks.done, false))
const pendingByUser = project(
  join(
    pendingTasks,
    from(schema.users),
    eq(schema.tasks.assigneeId, schema.users.id),
  ),
  { title: schema.tasks.title, name: schema.users.name },
)

export function ImmerTodoDemo() {
  const [doc, setDoc] = useState<TodoDoc>(todoFixture)
  const [draftTitle, setDraftTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState(todoFixture.users[0]?.id ?? '')
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
