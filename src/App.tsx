import { useState } from 'react'
import { evaluate } from './tarpit/index.js'
import { feeders, pending, pendingByUser } from './todo-schema.js'
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

function useTodo() {
  const [doc, setDoc] = useState<TodoDoc>(seed)
  const addTask = (input: { title: string; userId: string }) => {
    setDoc((prev) => feeders.addTask(prev, input))
  }
  const complete = (id: string) => {
    setDoc((prev) => feeders.complete(prev, id))
  }

  return {
    pending: evaluate(pending, doc),
    pendingByUser: evaluate(pendingByUser, doc),
    users: doc.users,
    addTask,
    complete,
  }
}

export default function App() {
  const { pending, pendingByUser, users, addTask, complete } = useTodo()
  const [title, setTitle] = useState('')
  const [userId, setUserId] = useState('')

  function submit(e: React.FormEvent) {
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="new task"
        />{' '}
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>
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
