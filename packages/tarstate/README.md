# Tarstate

Tarstate lets you query relation-shaped JSON data as rows.

Core Tarstate is framework-independent. The React adapter should stay thin: it
subscribes to a source, runs an inspectable query value, and returns rows plus
diagnostics.

Inside Patchpit the package is `@patchpit/tarstate`. Older prototypes may still
import `@tarstate/core`; treat that as the previous external package name until
those callers are migrated.

```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  as, defineSchema, eq, evaluate, from, fromObjectSource, id, leftJoin,
  maybe, pipe, project, ref, relation, string, where,
  type Query, type QueryResult, type RelationSource,
} from '@patchpit/tarstate'

const schema = defineSchema({
  documents: relation<{ id: string; title: string }>({
    key: 'id',
    fields: { id: id('document'), title: string() },
  }),
  owners: relation<{ documentId: string; name: string }>({
    key: 'documentId',
    fields: { documentId: ref('documents.id'), name: string() },
  }),
})

const source = fromObjectSource({
  documents: [
    { id: 'doc-a', title: 'Roadmap' },
    { id: 'doc-b', title: 'Release notes' },
  ],
  owners: [{ documentId: 'doc-a', name: 'Mina' }],
})

const document = as(schema.documents, 'document')
const owner = as(schema.owners, 'owner')

const documentById = (documentId: string) =>
  pipe(
    from(document),
    where(eq(document.id, documentId)),
    leftJoin(from(owner), eq(owner.documentId, document.id)),
    project({
      id: document.id,
      title: document.title,
      ownerName: maybe(owner.name),
    }),
  )

function useTarstateQuery<Row>(
  source: RelationSource,
  query: Query<Row>,
): QueryResult<Row> {
  const [state, setState] = useState<QueryResult<Row>>({
    rows: [],
    diagnostics: [],
  })

  useEffect(() => {
    let cancelled = false

    void evaluate(source, query).then((nextState) => {
      if (!cancelled) setState(nextState)
    })

    return () => {
      cancelled = true
    }
  }, [source, query])

  return state
}

export function DocumentSummary({ documentId }: { documentId: string }) {
  const query = useMemo(() => documentById(documentId), [documentId])
  const state = useTarstateQuery(source, query)

  if (state.diagnostics.length > 0) {
    return <pre>{JSON.stringify(state.diagnostics, null, 2)}</pre>
  }

  return state.rows.map((row) => (
    <article key={row.id}>
      <h2>{row.title}</h2>
      <p>{row.ownerName ?? 'Unassigned'}</p>
    </article>
  ))
}
```

## Acknowledgements

Tarstate borrows its shape from [Relic](https://github.com/wotbrew/relic),
after [Out of the Tar Pit](http://curtclifton.net/papers/MoseleyMarks06a.pdf).
