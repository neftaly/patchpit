import type { TerminalLineDraft } from './buffer.js'

export function terminalHelpText(): string {
  return [
    'Built-ins: cat, cd, clear, echo, help, ls, mkdir, pwd, rm, touch',
    'Paths support absolute paths plus dot and dot-dot segments.',
    'Echo supports > and >> redirection.',
  ].join('\n')
}

export function terminalWelcomeText(now: Date = new Date()): string {
  return [
    'Welcome to Patchpit Shell',
    `Last login: ${formatLoginTime(now)} on automergefs`,
    'Type "help" for commands.',
  ].join('\n')
}

export function terminalLoginGreeting(
  now: Date = new Date(),
): TerminalLineDraft {
  return {
    kind: 'output',
    text: terminalWelcomeText(now),
  }
}

function formatLoginTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
