import type { Atom, RelationRef } from './types.js'
import { getRelationSpec } from './internal.js'

export type CommandInput = Record<string, unknown>
export type CommandResult = Record<string, unknown> | void

export type Command<
  Input extends CommandInput,
  Result extends CommandResult = void,
> = {
  readonly name: string
  readonly input?: unknown
  readonly apply: (ctx: CommandContext<Input>) => Result
}

export type CommandContext<Input extends CommandInput> = {
  readonly tx: Transaction
  readonly input: Input
  readonly newId: IdGenerator
}

export type IdGenerator = (prefix: string) => string

export type Transaction = {
  readonly operations: ReadonlyArray<Operation>
}

export type Operation =
  | InsertOperation
  | UpdateOperation
  | RemoveOperation

export type InsertOperation = {
  readonly kind: 'insert'
  readonly relation: string
  readonly key: string
  readonly row: Row
}

export type UpdateOperation = {
  readonly kind: 'update'
  readonly relation: string
  readonly key: string
  readonly id: Atom
  readonly patch: RowPatch
}

export type RemoveOperation = {
  readonly kind: 'remove'
  readonly relation: string
  readonly key: string
  readonly id: Atom
}

export type Row = Record<string, Atom>
export type RowPatch = Partial<Row>

export function defineCommand<
  Input extends CommandInput,
  Result extends CommandResult = void,
>(command: Command<Input, Result>): Command<Input, Result> {
  return command
}

export function createTransaction(): Transaction {
  return { operations: [] }
}

export function insert<T extends Row, Rel extends string, Key extends string>(
  tx: Transaction,
  relation: RelationRef<T, Rel, Key>,
  row: T,
): void {
  const spec = getRelationSpec(relation)
  append(tx, {
    kind: 'insert',
    relation: spec.name,
    key: spec.key,
    row,
  })
}

export function update<
  T extends Row,
  Rel extends string,
  Key extends keyof T & string,
>(
  tx: Transaction,
  relation: RelationRef<T, Rel, Key>,
  id: T[Key],
  patch: Partial<Omit<T, Key>>,
): void {
  const spec = getRelationSpec(relation)
  append(tx, {
    kind: 'update',
    relation: spec.name,
    key: spec.key,
    id,
    patch,
  })
}

export function remove<
  T extends Row,
  Rel extends string,
  Key extends keyof T & string,
>(
  tx: Transaction,
  relation: RelationRef<T, Rel, Key>,
  id: T[Key],
): void {
  const spec = getRelationSpec(relation)
  append(tx, {
    kind: 'remove',
    relation: spec.name,
    key: spec.key,
    id,
  })
}

export function run<
  Input extends CommandInput,
  Result extends CommandResult,
>(
  ctx: CommandContext<CommandInput>,
  command: Command<Input, Result>,
  input: Input,
): Result {
  return command.apply({
    tx: ctx.tx,
    input,
    newId: ctx.newId,
  })
}

export function newId(
  ctx: Pick<CommandContext<CommandInput>, 'newId'>,
  prefix: string,
): string {
  return ctx.newId(prefix)
}

export function dispatch<
  Input extends CommandInput,
  Result extends CommandResult,
>(
  command: Command<Input, Result>,
  input: Input,
  options: { readonly newId?: IdGenerator } = {},
): { readonly result: Result; readonly tx: Transaction } {
  const tx = createTransaction()
  const result = command.apply({
    tx,
    input,
    newId: options.newId ?? defaultId,
  })
  return { result, tx }
}

function append(tx: Transaction, operation: Operation): void {
  ;(tx.operations as Operation[]).push(operation)
}

function defaultId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
