import { FilesystemDemo } from './filesystem-demo/index.js'
import { themeCssVars, themeStyle } from './theme.js'

export default function App() {
  return (
    <main className="app" style={themeCssVars(themeStyle)}>
      <FilesystemDemo />
      <a className="todo-link" href="/todo.html">
        immer todo
      </a>
    </main>
  )
}
