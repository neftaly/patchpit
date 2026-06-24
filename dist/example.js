import { defineSchema, defineApp, where, join, select, pipe, evaluate, eq, lt, and, not, primaryKey, unique, foreignKey } from './index.js';
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const schema = defineSchema({
    tasks: { id: '', title: '', done: false, userId: '' },
    users: { id: '', name: '' },
});
// ---------------------------------------------------------------------------
// Derived queries
// ---------------------------------------------------------------------------
const pending = where(schema.tasks, eq(schema.tasks.done, false));
const tasksByUser = join(schema.tasks, schema.users, eq(schema.tasks.userId, schema.users.id));
const pendingByUser = select(join(where(schema.tasks, eq(schema.tasks.done, false)), schema.users, eq(schema.tasks.userId, schema.users.id)), 'title', 'name');
const complex = where(schema.tasks, and(eq(schema.tasks.done, false), not(eq(schema.tasks.title, ''))));
const pendingByUserViaP = pipe(schema.tasks, qb => where(qb, eq(schema.tasks.done, false)), qb => join(qb, schema.users, eq(schema.tasks.userId, schema.users.id)), qb => select(qb, 'title', 'name'));
const withUser = (qb) => join(qb, schema.users, eq(schema.tasks.userId, schema.users.id));
const allByUser = withUser(schema.tasks);
const urgentByUser = withUser(where(schema.tasks, lt(schema.tasks.title, 'z')));
// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------
const constraints = [
    primaryKey(schema.tasks.id),
    primaryKey(schema.users.id),
    unique(schema.users.name),
    foreignKey(eq(schema.tasks.userId, schema.users.id)),
];
// ---------------------------------------------------------------------------
// App spec
// ---------------------------------------------------------------------------
const app = defineApp({
    schema,
    derived: { pending, tasksByUser, pendingByUser, complex, pendingByUserViaP, allByUser, urgentByUser },
    constraints,
});
// ---------------------------------------------------------------------------
// evaluate — pure function over an immutable doc snapshot.
//
// An Automerge doc (A.Doc<{ tasks: Task[], users: User[] }>) satisfies Doc
// at read time — pass it directly instead of the plain object below.
// ---------------------------------------------------------------------------
const doc = {
    tasks: [
        { id: 't1', title: 'buy oat milk', done: false, userId: 'u1' },
        { id: 't2', title: 'read OOTTP', done: true, userId: 'u1' },
        { id: 't3', title: 'write tests', done: false, userId: 'u2' },
    ],
    users: [
        { id: 'u1', name: 'alice' },
        { id: 'u2', name: 'bob' },
    ],
};
const pendingRows = evaluate(pending, doc); // Task[]
const byUserRows = evaluate(tasksByUser, doc); // (Task & User)[]
const pendingByURows = evaluate(pendingByUser, doc); // { title, name }[]
// Verify shapes
pendingRows[0]?.title;
byUserRows[0]?.name;
pendingByURows[0]?.title;
// ---------------------------------------------------------------------------
// Rule 1 — cross-relation predicate rejected at call site
// ---------------------------------------------------------------------------
// @ts-expect-error Predicate<'users'> not assignable to Predicate<NoInfer<'tasks'>>
where(schema.tasks, eq(schema.users.name, 'alice'));
//# sourceMappingURL=example.js.map