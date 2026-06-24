import { lazy, Suspense, useState } from 'react'

type DemoPage = 'filesystem' | 'immer-todo'

const FilesystemDemo = lazy(() =>
  import('./filesystem-demo/index.js').then((module) => ({
    default: module.FilesystemDemo,
  })),
)

const ImmerTodoDemo = lazy(() =>
  import('./immer-todo-demo.js').then((module) => ({
    default: module.ImmerTodoDemo,
  })),
)

export default function App() {
  const [page, setPage] = useState<DemoPage>('filesystem')

  return (
    <main className="app">
      <nav className="demo-tabs" aria-label="demos">
        <button
          type="button"
          aria-pressed={page === 'filesystem'}
          onClick={() => setPage('filesystem')}
        >
          automerge filesystem
        </button>
        <button
          type="button"
          aria-pressed={page === 'immer-todo'}
          onClick={() => setPage('immer-todo')}
        >
          immer todo
        </button>
      </nav>
      <Suspense fallback={<section className="demo-pane">loading</section>}>
        {page === 'filesystem' ? <FilesystemDemo /> : <ImmerTodoDemo />}
      </Suspense>
    </main>
  )
}
