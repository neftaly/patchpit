const defaultTodoDemoDevUrl = 'http://127.0.0.1:5320/'
const todoDemoBuildUrl = '../todo-demo/'

export function todoDemoUrl(): string {
  return import.meta.env.DEV
    ? (import.meta.env.VITE_TODO_DEMO_URL ?? defaultTodoDemoDevUrl)
    : todoDemoBuildUrl
}
