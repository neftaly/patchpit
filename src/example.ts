import type { QB } from './types.js'
import { defineSchema, defineApp, where, join, select, pipe, eq, lt, and, not, primaryKey, unique, foreignKey } from './index.js'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = defineSchema({
  tasks: { id: '' as string, title: '' as string, done: false as boolean, userId: '' as string },
  users: { id: '' as string, name: '' as string },
})

// ---------------------------------------------------------------------------
// Derived queries
// ---------------------------------------------------------------------------

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
  and(
    eq(schema.tasks.done, false),
    not(eq(schema.tasks.title, '')),
  ),
)

// pipe: lambdas thread the QB, TypeScript infers each qb type from the overload
const pendingByUserViaP = pipe(
  schema.tasks,
  qb => where(qb, eq(schema.tasks.done, false)),
  qb => join(qb, schema.users, eq(schema.tasks.userId, schema.users.id)),
  qb => select(qb, 'title', 'name'),
)

// reusable step: a typed function.
// Rels extends 'tasks' constrains the QB to task-relations, which is required
// because the join predicate references schema.tasks fields.
const withUser = <T extends Record<string, string | boolean | number | null>>(
  qb: QB<T, 'tasks'>
) => join(qb, schema.users, eq(schema.tasks.userId, schema.users.id))

const allByUser    = withUser(schema.tasks)
const urgentByUser = withUser(where(schema.tasks, lt(schema.tasks.title, 'z')))

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

const constraints = [
  primaryKey(schema.tasks.id),
  primaryKey(schema.users.id),
  unique(schema.users.name),
  foreignKey(eq(schema.tasks.userId, schema.users.id)),
] as const

// ---------------------------------------------------------------------------
// App spec
// ---------------------------------------------------------------------------

const app = defineApp({
  schema,
  derived: { pending, tasksByUser, pendingByUser, complex, pendingByUserViaP, allByUser, urgentByUser },
  constraints,
})

// ---------------------------------------------------------------------------
// Rule 1 — cross-relation predicate rejected at call site
// ---------------------------------------------------------------------------

// @ts-expect-error Predicate<'users'> not assignable to Predicate<NoInfer<'tasks'>>
where(schema.tasks, eq(schema.users.name, 'alice'))
