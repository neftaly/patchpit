import { useState } from 'react'
import { evaluate } from '../tarpit/index.js'
import { app, pending, pendingByUser, tasksByUser } from '../todo-schema.js'
import type { TodoDoc } from '../todo-schema.js'

// ---------------------------------------------------------------------------
// useTodo — binds the tarpit App spec to React state.
//
// The doc lives in useState; Immer producers inside app.feeders handle
// mutations. evaluate() is called on every render — it's a pure lens over
// the current doc snapshot, so this is correct and cheap.
// ---------------------------------------------------------------------------

const seed: TodoDoc = {
  tasks: [
    { id: '1', title: 'buy oat milk', done: false, userId: 'u1' },
    { id: '2', title: 'read OOTTP',   done: false, userId: 'u1' },
    { id: '3', title: 'write tests',  done: false, userId: 'u2' },
  ],
  users: [
    { id: 'u1', name: 'alice' },
    { id: 'u2', name: 'bob' },
  ],
}

export function useTodo() {
  const [doc, setDoc] = useState<TodoDoc>(seed)

  function dispatch<K extends keyof typeof app.feeders>(
    feeder: K,
    input:  Parameters<(typeof app.feeders)[K]>[1],
  ) {
    setDoc(prev =>
      (app.feeders[feeder] as (d: TodoDoc, i: typeof input) => TodoDoc)(prev, input)
    )
  }

  return {
    // Each query is a pure read — `doc as never` bridges TodoDoc → Doc without
    // a runtime cost. The tarpit Doc type is a structural supertype; the cast
    // is safe as long as all row values are Atom (string | number | boolean | null).
    pending:     evaluate(pending,      doc as never),
    pendingByUser: evaluate(pendingByUser, doc as never),
    tasksByUser: evaluate(tasksByUser,  doc as never),
    users:       doc.users,
    dispatch,
  }
}
