import type { QB, Doc } from './index.js'
import { defineSchema, defineApp, createRuntime, evaluate,
         where, join, select, pipe,
         eq, lt, and, not,
         primaryKey, unique, foreignKey } from './index.js'

// ===========================================================================
// Layer 1 — Essential State (base relations)
// ===========================================================================

const schema = defineSchema({
  tasks: { id: '' as string, title: '' as string, done: false as boolean, userId: '' as string },
  users: { id: '' as string, name: '' as string },
})

// ===========================================================================
// Layer 2 — Essential Logic (derived queries + integrity constraints)
// ===========================================================================

const pending = where(schema.tasks, eq(schema.tasks.done, false))

const tasksByUser = join(schema.tasks, schema.users, eq(schema.tasks.userId, schema.users.id))

const pendingByUser = select(
  join(
    where(schema.tasks, eq(schema.tasks.done, false)),
    schema.users,
    eq(schema.tasks.userId, schema.users.id),
  ),
  'title', 'name',
)

const complex = where(
  schema.tasks,
  and(eq(schema.tasks.done, false), not(eq(schema.tasks.title, ''))),
)

const pendingByUserViaP = pipe(
  schema.tasks,
  qb => where(qb, eq(schema.tasks.done, false)),
  qb => join(qb, schema.users, eq(schema.tasks.userId, schema.users.id)),
  qb => select(qb, 'title', 'name'),
)

const withUser = <T extends Record<string, string | boolean | number | null>>(
  qb: QB<T, 'tasks'>
) => join(qb, schema.users, eq(schema.tasks.userId, schema.users.id))

const allByUser    = withUser(schema.tasks)
const urgentByUser = withUser(where(schema.tasks, lt(schema.tasks.title, 'z')))

const constraints = [
  primaryKey(schema.tasks.id),
  primaryKey(schema.users.id),
  unique(schema.users.name),
  foreignKey(eq(schema.tasks.userId, schema.users.id)),
] as const

// ===========================================================================
// Layer 3 — Infrastructure (feeders + observers)
//
// Feeders: the only mutation path into essential state.
//   Signature: (doc, input) → doc'
//   For Automerge: swap the spread with A.change(doc, d => { d.tasks.push(...) })
//
// Observers: the only effect path out of derived state.
//   Keyed by derived-query name; TypeScript checks the row type per key.
// ===========================================================================

const app = defineApp({
  schema,
  derived:     { pending, tasksByUser, pendingByUser, complex, pendingByUserViaP, allByUser, urgentByUser },
  constraints,

  feeders: {
    // `doc: any` lets users plug in any doc representation (plain object,
    // Automerge A.Doc, Immer draft, …). The input type is what dispatch enforces.
    addTask: (doc: any, input: { title: string; userId: string }) => ({
      ...doc,
      tasks: [...doc.tasks, { id: `t${doc.tasks.length + 1}`, done: false, ...input }],
    }),
    complete: (doc: any, id: string) => ({
      ...doc,
      tasks: doc.tasks.map((t: any) => t.id === id ? { ...t, done: true } : t),
    }),
    addUser: (doc: any, input: { name: string }) => ({
      ...doc,
      users: [...doc.users, { id: `u${doc.users.length + 1}`, ...input }],
    }),
  },

  observers: {
    // TypeScript checks that `rows` matches the pendingByUser QB's row type: { title, name }
    pendingByUser: rows => console.log('pending:', rows.map(r => `${r.name} / ${r.title}`)),
  },
})

// ===========================================================================
// Runtime — binds the App spec to a live mutable doc
// ===========================================================================

const rt = createRuntime(app, {
  tasks: [
    { id: 't1', title: 'buy oat milk', done: false, userId: 'u1' },
    { id: 't2', title: 'read OOTTP',   done: true,  userId: 'u1' },
  ],
  users: [
    { id: 'u1', name: 'alice' },
  ],
})

// Synchronous snapshot read — typed from the QB's row type
const snapshot = rt.query('pending')  // ReadonlyArray<{ id, title, done, userId }>
snapshot[0]?.title                    // 'buy oat milk'

// Dispatch feeders — doc updates, derived re-evaluates, observers fire
rt.dispatch('addUser', { name: 'bob' })
rt.dispatch('addTask', { title: 'write tests', userId: 'u2' })
// console: "pending: alice / buy oat milk, bob / write tests"

rt.dispatch('complete', 't1')
// console: "pending: bob / write tests"  (alice's task is done)

// ===========================================================================
// Proof of Rule 1 — cross-relation predicate rejected at the call site
// ===========================================================================

// @ts-expect-error Predicate<'users'> is not assignable to Predicate<NoInfer<'tasks'>>
where(schema.tasks, eq(schema.users.name, 'alice'))

// ===========================================================================
// evaluate — pure snapshot read, no runtime needed
// ===========================================================================

const doc: Doc = {
  tasks: [
    { id: 't1', title: 'buy oat milk', done: false,  userId: 'u1' },
    { id: 't2', title: 'read OOTTP',   done: true,   userId: 'u1' },
    { id: 't3', title: 'write tests',  done: false,  userId: 'u2' },
  ],
  users: [
    { id: 'u1', name: 'alice' },
    { id: 'u2', name: 'bob'   },
  ],
}

const pendingRows    = evaluate(pending,       doc)
const byUserRows     = evaluate(tasksByUser,   doc)
const pendingByURows = evaluate(pendingByUser, doc)

pendingRows[0]?.title     // typed: string
byUserRows[0]?.name       // typed: string
pendingByURows[0]?.title  // typed: string
