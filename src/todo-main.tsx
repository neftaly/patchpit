import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ImmerTodoDemo } from './immer-todo-demo.js'

const el = document.getElementById('root')
if (!el) throw new Error('no #root')
createRoot(el).render(
  <StrictMode>
    <ImmerTodoDemo />
  </StrictMode>,
)
