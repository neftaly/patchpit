import { useState } from 'react'
import { useTodo } from './hooks/useTodo.js'

export default function App() {
  const { pending, pendingByUser, users, dispatch } = useTodo()
  const [title, setTitle] = useState('')
  const [userId, setUserId] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !userId) return
    dispatch('addTask', { title: title.trim(), userId })
    setTitle('')
  }

  return (
    <main style={{ fontFamily: 'monospace', maxWidth: 600, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>tarpit todo</h1>

      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="new task"
          style={{ flex: 1, padding: '4px 8px' }}
        />
        <select value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">— user —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button type="submit">add</button>
      </form>

      <section>
        <h2>pending by user <small style={{ fontWeight: 'normal', fontSize: '0.75em' }}>(join)</small></h2>
        {pendingByUser.length === 0
          ? <p style={{ color: '#888' }}>none</p>
          : <ul style={{ padding: 0, listStyle: 'none' }}>
              {pendingByUser.map((row, i) => (
                <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee' }}>
                  <span><strong>{row.name}</strong> / {row.title}</span>
                </li>
              ))}
            </ul>
        }
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>pending tasks <small style={{ fontWeight: 'normal', fontSize: '0.75em' }}>(where done = false)</small></h2>
        {pending.length === 0
          ? <p style={{ color: '#888' }}>all done!</p>
          : <ul style={{ padding: 0, listStyle: 'none' }}>
              {pending.map(task => (
                <li key={task.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee' }}>
                  <span>{task.title}</span>
                  <button onClick={() => dispatch('complete', task.id)}>✓</button>
                </li>
              ))}
            </ul>
        }
      </section>
    </main>
  )
}
