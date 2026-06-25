import type {
  InsertOperation,
  Operation,
  RemoveOperation,
  Row,
  RowPatch,
  Transaction,
  UpdateOperation,
} from './command.js'
import type { Atom } from './types.js'

export type { Operation, Transaction } from './command.js'

export type MaybePromise<T> = T | PromiseLike<T>

export type RelationInsert<RowValue extends Row = Row> = {
  readonly relation: string
  readonly key: string
  readonly row: RowValue
}

export type RelationUpdate<PatchValue extends RowPatch = RowPatch> = {
  readonly relation: string
  readonly key: string
  readonly id: Atom
  readonly patch: PatchValue
}

export type RelationRemove = {
  readonly relation: string
  readonly key: string
  readonly id: Atom
}

export interface RelationWriter<
  RowValue extends Row = Row,
  PatchValue extends RowPatch = RowPatch,
> {
  insert(input: RelationInsert<RowValue>): MaybePromise<void>
  update(input: RelationUpdate<PatchValue>): MaybePromise<void>
  remove(input: RelationRemove): MaybePromise<void>
}

export interface OperationSink<Op extends Operation = Operation> {
  write(operation: Op): MaybePromise<void>
}

export type TransactionWriter =
  | RelationWriter
  | OperationSink

export async function applyTransaction(
  writer: TransactionWriter,
  tx: Pick<Transaction, 'operations'>,
): Promise<void> {
  for (const operation of tx.operations) {
    await applyOperation(writer, operation)
  }
}

export function applyOperation(
  writer: TransactionWriter,
  operation: Operation,
): MaybePromise<void> {
  if (isOperationSink(writer)) return writer.write(operation)

  switch (operation.kind) {
    case 'insert':
      return writer.insert(relationInsert(operation))
    case 'update':
      return writer.update(relationUpdate(operation))
    case 'remove':
      return writer.remove(relationRemove(operation))
  }
}

function isOperationSink(writer: TransactionWriter): writer is OperationSink {
  return 'write' in writer
}

function relationInsert(operation: InsertOperation): RelationInsert {
  return {
    relation: operation.relation,
    key: operation.key,
    row: operation.row,
  }
}

function relationUpdate(operation: UpdateOperation): RelationUpdate {
  return {
    relation: operation.relation,
    key: operation.key,
    id: operation.id,
    patch: operation.patch,
  }
}

function relationRemove(operation: RemoveOperation): RelationRemove {
  return {
    relation: operation.relation,
    key: operation.key,
    id: operation.id,
  }
}
