import { Repo } from '@automerge/automerge-repo'
import type { DocHandle } from '@automerge/automerge-repo'
import { useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import { evaluate, fromObject } from './tarpit/index.js'
import { pending, pendingByUser } from './todo-schema.js'
import type { TodoDoc } from './todo-schema.js'

const seed: TodoDoc = {
  tasks: [
    { id: '1', title: 'buy oat milk', done: false, userId: 'u1' },
    { id: '2', title: 'read OOTTP', done: false, userId: 'u1' },
    { id: '3', title: 'write tests', done: false, userId: 'u2' },
  ],
  users: [
    { id: 'u1', name: 'alice' },
    { id: 'u2', name: 'bob' },
  ],
}

const repo = new Repo()
const todoHandle = repo.create<TodoDoc>(seed)

function useHandleDoc<T>(handle: DocHandle<T>): T {
  return useSyncExternalStore(
    (notify) => {
      handle.on('change', notify)
      handle.on('delete', notify)
      return () => {
        handle.off('change', notify)
        handle.off('delete', notify)
      }
    },
    () => handle.doc() as T,
    () => handle.doc() as T,
  )
}

function useTodo(handle: DocHandle<TodoDoc>) {
  const doc = useHandleDoc(handle)
  const source = fromObject(doc)
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

  return {
    pending: evaluate(pending, source),
    pendingByUser: evaluate(pendingByUser, source),
    users: doc.users,
    addTask,
    complete,
  }
}

export default function App() {
  const { pending, pendingByUser, users, addTask, complete } =
    useTodo(todoHandle)
  const [title, setTitle] = useState('')
  const [userId, setUserId] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !userId) return
    addTask({ title: title.trim(), userId })
    setTitle('')
  }

  return (
    <main>
      <h1>tarpit todo</h1>

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
