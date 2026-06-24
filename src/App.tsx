import { Repo, isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { DocHandle } from '@automerge/automerge-repo'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
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

type JsonRecord = Record<string, unknown>
type JsonArray = unknown[]
type JsonDocValidator = (doc: JsonRecord) => string | null

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

function JsonDocEditor<T extends JsonRecord>({
  title,
  handle,
  validate,
}: {
  title: string
  handle: DocHandle<T>
  validate?: JsonDocValidator
}) {
  const doc = useDocument(handle)
  const docText = formatJson(doc)
  const fieldName = `${title.toLowerCase().replaceAll(' ', '-')}-json`
  const [text, setText] = useState(() => docText)
  const [error, setError] = useState<string | null>(null)
  const isChanged = text !== docText

  useEffect(() => {
    setText(docText)
    setError(null)
  }, [docText])

  function editDraft(nextText: string) {
    setText(nextText)
    const parsed = parseJsonRecord(nextText)
    setError(parsed.ok ? (validate?.(parsed.value) ?? null) : parsed.error)
  }

  function applyDraft() {
    const parsed = parseJsonRecord(text)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    const validationError = validate?.(parsed.value)
    if (validationError) {
      setError(validationError)
      return
    }

    patchDoc(handle, parsed.value as T)
  }

  function resetDraft() {
    setText(docText)
    setError(null)
  }

  return (
    <section>
      <h3>{title}</h3>
      <p>{handle.url}</p>
      <textarea
        id={fieldName}
        name={fieldName}
        value={text}
        onChange={(e) => editDraft(e.target.value)}
        rows={Math.max(8, text.split('\n').length + 1)}
        spellCheck={false}
        style={{ boxSizing: 'border-box', width: '100%' }}
      />
      <p>
        <button
          type="button"
          onClick={applyDraft}
          disabled={!isChanged || !!error}
        >
          apply json
        </button>{' '}
        <button type="button" onClick={resetDraft} disabled={!isChanged}>
          reset
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

function patchDoc<T extends JsonRecord>(handle: DocHandle<T>, next: T) {
  handle.change((draft) => {
    patchRecord(draft, next)
  })
}

function patchRecord(target: JsonRecord, next: JsonRecord) {
  for (const key of Object.keys(target)) {
    if (!(key in next)) delete target[key]
  }

  for (const [key, value] of Object.entries(next)) {
    patchRecordValue(target, key, value)
  }
}

function patchArray(target: JsonArray, next: JsonArray) {
  target.splice(next.length)
  for (let index = 0; index < next.length; index += 1) {
    patchArrayValue(target, index, next[index])
  }
}

function patchRecordValue(target: JsonRecord, key: string, next: unknown) {
  const current = target[key]
  if (patchComposite(current, next)) return

  target[key] = next
}

function patchArrayValue(target: JsonArray, index: number, next: unknown) {
  const current = target[index]
  if (patchComposite(current, next)) return

  target[index] = next
}

function patchComposite(current: unknown, next: unknown): boolean {
  if (isJsonRecord(current) && isJsonRecord(next)) {
    patchRecord(current, next)
    return true
  }

  if (Array.isArray(current) && Array.isArray(next)) {
    patchArray(current, next)
    return true
  }

  return false
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function parseJsonRecord(
  text: string,
): { ok: true; value: JsonRecord } | { ok: false; error: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  if (!isJsonRecord(value)) {
    return { ok: false, error: 'Root value must be a JSON object.' }
  }

  return { ok: true, value }
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

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
