import { Repo, isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { DocHandle } from '@automerge/automerge-repo'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { JsonDocEditor, isJsonRecord } from './json-doc-editor.js'
import type { JsonRecord } from './json-doc-editor.js'
import { useAutomergeQueries, useDocument } from './tarstate/index.js'
import { taskUserSourcesField, todoQueries } from './todo-schema.js'
import type { Task, TasksDoc, User, UsersDoc } from './todo-schema.js'

const linkedUsersDoc: UsersDoc = {
  users: [
    { id: 'u1', name: 'alice' },
    { id: 'u2', name: 'bob' },
  ],
}

const unlinkedUsersDoc: UsersDoc = {
  users: [{ id: 'u3', name: 'cara' }],
}

function tasksDocSeed(linkedUsersDocUrl: string): TasksDoc {
  return {
    userSources: [linkedUsersDocUrl],
    tasks: [
      { id: '1', title: 'buy oat milk', done: false, assigneeId: 'u1' },
      { id: '2', title: 'read OOTTP', done: false, assigneeId: 'u1' },
      { id: '3', title: 'write tests', done: false, assigneeId: 'u2' },
      { id: '4', title: 'invite cara', done: false, assigneeId: 'u3' },
    ],
  }
}

const repo = new Repo()
const linkedUsersHandle = repo.create<UsersDoc>(linkedUsersDoc)
const unlinkedUsersHandle = repo.create<UsersDoc>(unlinkedUsersDoc)
const tasksHandle = repo.create<TasksDoc>(tasksDocSeed(linkedUsersHandle.url))

type TodoView = {
  pending: ReadonlyArray<Task>
  pendingByUser: ReadonlyArray<Pick<Task, 'title'> & Pick<User, 'name'>>
  users: ReadonlyArray<User>
}

function useTodo(handle: DocHandle<TasksDoc>) {
  const taskDoc = useDocument(handle)
  const view = useAutomergeQueries(handle, todoQueries, {
    repo,
    linkField: taskUserSourcesField,
  })
  const data: TodoView = view.data

  const addTask = (input: { title: string; assigneeId: string }) => {
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
  const addUserSource = (url: string) => {
    if (!isValidAutomergeUrl(url)) return

    handle.change((d) => {
      if (!d.userSources.includes(url)) d.userSources.push(url)
    })
  }

  return {
    ...data,
    status: view.status,
    error: view.error,
    isLoading: view.isLoading,
    taskDocUrl: handle.url,
    linkedUserSourceUrls: taskDoc.userSources,
    addTask,
    complete,
    addUserSource,
  }
}

function validateTasksDoc(doc: JsonRecord): string | null {
  if (!isStringArray(doc.userSources)) {
    return 'tasks doc needs userSources: string[].'
  }
  if (!Array.isArray(doc.tasks)) {
    return 'tasks doc needs tasks: array.'
  }
  if (!doc.tasks.every(isTask)) {
    return 'each task needs string id/title/assigneeId and boolean done.'
  }
  return null
}

function validateUsersDoc(doc: JsonRecord): string | null {
  if (!Array.isArray(doc.users)) {
    return 'users doc needs users: array.'
  }
  if (!doc.users.every(isUser)) {
    return 'each user needs string id and name.'
  }
  return null
}

function isTask(value: unknown): value is Task {
  return (
    isJsonRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.done === 'boolean' &&
    typeof value.assigneeId === 'string'
  )
}

function isUser(value: unknown): value is User {
  return (
    isJsonRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export default function App() {
  const {
    pending,
    pendingByUser,
    users,
    taskDocUrl,
    linkedUserSourceUrls,
    addTask,
    complete,
    addUserSource,
    status,
    error,
  } = useTodo(tasksHandle)
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [userSourceUrl, setUserSourceUrl] = useState<string>(
    unlinkedUsersHandle.url,
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !assigneeId) return
    addTask({ title: title.trim(), assigneeId })
    setTitle('')
  }

  function submitSource(e: FormEvent) {
    e.preventDefault()
    if (!userSourceUrl.trim()) return
    addUserSource(userSourceUrl.trim())
  }

  return (
    <main>
      <h1>tarstate todo</h1>

      <dl>
        <dt>tasks doc</dt>
        <dd>{taskDocUrl}</dd>
        <dt>linked user sources</dt>
        <dd>{linkedUserSourceUrls.join(', ')}</dd>
        <dt>unlinked users doc</dt>
        <dd>{unlinkedUsersHandle.url}</dd>
      </dl>

      <form onSubmit={submitSource}>
        <input
          name="userSourceUrl"
          value={userSourceUrl}
          onChange={(e) => setUserSourceUrl(e.target.value)}
          placeholder="user doc automerge url"
        />{' '}
        <button type="submit">link user source</button>
      </form>

      <form onSubmit={submit}>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="new task"
        />{' '}
        <select
          name="assigneeId"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
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

      <hr />

      <h2>documents</h2>
      <JsonDocEditor
        title="tasks doc"
        handle={tasksHandle}
        validate={validateTasksDoc}
      />
      <JsonDocEditor
        title="linked users doc"
        handle={linkedUsersHandle}
        validate={validateUsersDoc}
      />
      <JsonDocEditor
        title="unlinked users doc"
        handle={unlinkedUsersHandle}
        validate={validateUsersDoc}
      />
    </main>
  )
}
