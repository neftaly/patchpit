import { Repo, isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { DocHandle } from '@automerge/automerge-repo'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAutomergeQueries, useDocument } from './tarstate/index.js'
import { todoQueries } from './todo-schema.js'
import type { TaskDoc, TaskRow, UserDoc, UserRow } from './todo-schema.js'

const primaryUsers: UserDoc = {
  users: [
    { id: 'u1', name: 'alice' },
    { id: 'u2', name: 'bob' },
  ],
}

const extraUsers: UserDoc = {
  users: [{ id: 'u3', name: 'cara' }],
}

function taskSeed(src: string): TaskDoc {
  return {
    src: [src],
    tasks: [
      { id: '1', title: 'buy oat milk', done: false, userId: 'u1' },
      { id: '2', title: 'read OOTTP', done: false, userId: 'u1' },
      { id: '3', title: 'write tests', done: false, userId: 'u2' },
      { id: '4', title: 'invite cara', done: false, userId: 'u3' },
    ],
  }
}

const repo = new Repo()
const primaryUsersHandle = repo.create<UserDoc>(primaryUsers)
const extraUsersHandle = repo.create<UserDoc>(extraUsers)
const tasksHandle = repo.create<TaskDoc>(taskSeed(primaryUsersHandle.url))

type TodoView = {
  pending: ReadonlyArray<TaskRow>
  pendingByUser: ReadonlyArray<Pick<TaskRow, 'title'> & Pick<UserRow, 'name'>>
  users: ReadonlyArray<UserRow>
}

function useTodo(handle: DocHandle<TaskDoc>) {
  const taskDoc = useDocument(handle)
  const view = useAutomergeQueries(handle, todoQueries, { repo })
  const data: TodoView = view.data

  const addTask = (input: { title: string; userId: string }) => {
    handle.change((d) => {
      d.tasks.push({ id: crypto.randomUUID(), done: false, ...input })
    })
  }
  const complete = (id: string) => {
    handle.change((d) => {
      const task = d.tasks.find((t) => t.id === id)
      if (task) task.done = true
    })
  }
  const addSource = (src: string) => {
    if (!isValidAutomergeUrl(src)) return

    handle.change((d) => {
      if (!d.src.includes(src)) d.src.push(src)
    })
  }

  return {
    ...data,
    status: view.status,
    error: view.error,
    isLoading: view.isLoading,
    taskDocUrl: handle.url,
    linkedDocUrls: taskDoc.src,
    addTask,
    complete,
    addSource,
  }
}

export default function App() {
  const {
    pending,
    pendingByUser,
    users,
    taskDocUrl,
    linkedDocUrls,
    addTask,
    complete,
    addSource,
    status,
    error,
  } = useTodo(tasksHandle)
  const [title, setTitle] = useState('')
  const [userId, setUserId] = useState('')
  const [src, setSrc] = useState<string>(extraUsersHandle.url)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !userId) return
    addTask({ title: title.trim(), userId })
    setTitle('')
  }

  function submitSource(e: FormEvent) {
    e.preventDefault()
    if (!src.trim()) return
    addSource(src.trim())
  }

  return (
    <main>
      <h1>tarstate todo</h1>

      <dl>
        <dt>task doc</dt>
        <dd>{taskDocUrl}</dd>
        <dt>loaded src docs</dt>
        <dd>{linkedDocUrls.join(', ')}</dd>
        <dt>available user doc</dt>
        <dd>{extraUsersHandle.url}</dd>
      </dl>

      <form onSubmit={submitSource}>
        <input
          name="src"
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          placeholder="automerge doc url"
        />{' '}
        <button type="submit">link doc</button>
      </form>

      <form onSubmit={submit}>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="new task"
        />{' '}
        <select
          name="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">— user —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>{' '}
        <button type="submit">add</button>
      </form>

      <h2>pending by user</h2>
      {status === 'error' && <p role="alert">{String(error)}</p>}
      <table>
        <thead>
          <tr>
            <th>user</th>
            <th>task</th>
          </tr>
        </thead>
        <tbody>
          {pendingByUser.map((row, i) => (
            <tr key={i}>
              <td>{row.name}</td>
              <td>{row.title}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>pending tasks</h2>
      <table>
        <thead>
          <tr>
            <th>task</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pending.map((task) => (
            <tr key={task.id}>
              <td>{task.title}</td>
              <td>
                <button onClick={() => complete(task.id)}>done</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
