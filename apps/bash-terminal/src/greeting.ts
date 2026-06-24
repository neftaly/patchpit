import type { TerminalLineDraft } from './buffer.js'

export function terminalHelpText(): string {
  return [
    'Built-ins: cat, cd, clear, echo, help, ls, mkdir, pwd, rm, touch',
    'Paths support absolute paths plus dot and dot-dot segments.',
    'Echo supports > and >> redirection.',
  ].join('\n')
}

export function terminalWelcomeText(): string {
  return 'Welcome to Patchpit Shell.\nType "help" for commands.'
}

export function terminalLoginGreeting(): TerminalLineDraft {
  return {
    kind: 'output',
    text: terminalWelcomeText(),
  }
}
