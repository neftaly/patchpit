export type SabCompatibleBuffer = ArrayBuffer | SharedArrayBuffer;

export type SabScalarKind = 'f32' | 'f64' | 'i32' | 'u32';

export type SabRowField<Name extends string = string> = {
  readonly name: Name;
  readonly kind: SabScalarKind;
};

export type SabRowSchema<Fields extends readonly SabRowField[] = readonly SabRowField[]> = {
  readonly relationName: string;
  readonly fields: Fields;
};

export type SabRowRecord<Fields extends readonly SabRowField[]> = {
  readonly [Field in Fields[number] as Field['name']]: number;
};

export type SabFieldLayout = SabRowField & {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly alignment: number;
};

export type SabRowLayout<Fields extends readonly SabRowField[] = readonly SabRowField[]> = {
  readonly relationName: string;
  readonly fields: readonly SabFieldLayout[];
  readonly schema: SabRowSchema<Fields>;
  readonly controlBytes: number;
  readonly slotHeaderBytes: number;
  readonly payloadBytes: number;
  readonly slotBytes: number;
};

export type SabRowRingOptions = {
  readonly capacity: number;
  readonly shared?: boolean;
};

export type SabRowRingAttachOptions = {
  readonly buffer: SabCompatibleBuffer;
  readonly capacity: number;
};

export type SabAppendResult = {
  readonly relationName: string;
  readonly sequence: number;
  readonly slot: number;
  readonly droppedRows: number;
  readonly pendingRows: number;
  readonly highWatermark: number;
};

export type SabReadOptions = {
  readonly afterSequence?: number;
  readonly limit?: number;
};

export type SabSnapshotRow<Row extends Record<string, number>> = {
  readonly sequence: number;
  readonly slot: number;
  readonly values: Row;
};

export type SabReadSnapshot<Row extends Record<string, number>> = {
  readonly relationName: string;
  readonly afterSequence: number;
  readonly oldestAvailableSequence: number;
  readonly throughSequence: number;
  readonly nextSequence: number;
  readonly missedRows: number;
  readonly rows: readonly SabSnapshotRow<Row>[];
  readonly diagnostics: SabRowTransportDiagnostics;
};

export type SabRowTransportDiagnostics = {
  readonly relationName: string;
  readonly capacity: number;
  readonly shared: boolean;
  readonly writeSequence: number;
  readonly readSequence: number;
  readonly availableRows: number;
  readonly droppedRows: number;
  readonly overflowEvents: number;
  readonly highWatermark: number;
  readonly backpressure: boolean;
};

export type SabRowSnapshotTraceRow<Row extends Record<string, number>> = Row & {
  readonly row: 'sab_row_snapshot';
  readonly relationName: string;
  readonly sequence: number;
  readonly slot: number;
};

export type SabRowDiagnosticTraceRow = {
  readonly row: 'sab_row_diagnostic';
  readonly relationName: string;
  readonly code: 'backpressure' | 'dropped_rows' | 'snapshot_missed_rows';
  readonly severity: 'warning';
  readonly capacity: number;
  readonly writeSequence: number;
  readonly readSequence: number;
  readonly droppedRows: number;
  readonly overflowEvents: number;
  readonly highWatermark: number;
  readonly missedRows: number;
};

export type SabRowSurfaceTraceRow<Row extends Record<string, number>> =
  | SabRowSnapshotTraceRow<Row>
  | SabRowDiagnosticTraceRow;

export type SabRowRing<Row extends Record<string, number>> = {
  readonly buffer: SabCompatibleBuffer;
  readonly capacity: number;
  readonly layout: SabRowLayout;
  readonly shared: boolean;
  append: (row: Row) => SabAppendResult;
  commitRead: (sequence: number) => void;
  diagnostics: () => SabRowTransportDiagnostics;
  readSnapshot: (options?: SabReadOptions) => SabReadSnapshot<Row>;
  traceRows: (snapshot?: SabReadSnapshot<Row>) => readonly SabRowSurfaceTraceRow<Row>[];
};

export const sabTraceEventCode = {
  append: 1,
  snapshot: 2,
  droppedRows: 3,
  backpressure: 4
} as const;

export const tarstateWorkerTraceSchema = defineSabRowSchema('tarstate_worker_trace', [
  { name: 'at', kind: 'f64' },
  { name: 'order', kind: 'u32' },
  { name: 'sourceId', kind: 'u32' },
  { name: 'eventCode', kind: 'u32' },
  { name: 'sequence', kind: 'u32' },
  { name: 'slot', kind: 'u32' },
  { name: 'value0', kind: 'f64' },
  { name: 'value1', kind: 'f64' },
  { name: 'flags', kind: 'u32' }
] as const);

export type TarstateWorkerTraceSlabRow = SabRowRecord<typeof tarstateWorkerTraceSchema.fields>;

const CONTROL_WORDS = 12;
const CONTROL_BYTES = CONTROL_WORDS * Int32Array.BYTES_PER_ELEMENT;
const SLOT_HEADER_BYTES = 8;
const SLOT_SEQUENCE_BYTE_OFFSET = 0;
const SLOT_STATUS_BYTE_OFFSET = 4;
const TRANSPORT_VERSION = 1;
const MAX_SEQUENCE = 2_147_000_000;

const CONTROL_VERSION = 0;
const CONTROL_CAPACITY = 1;
const CONTROL_SLOT_BYTES = 2;
const CONTROL_WRITE_SEQUENCE = 3;
const CONTROL_READ_SEQUENCE = 4;
const CONTROL_DROPPED_ROWS = 5;
const CONTROL_OVERFLOW_EVENTS = 6;
const CONTROL_HIGH_WATERMARK = 7;
const CONTROL_APPEND_COUNT = 8;
const CONTROL_SHARED = 9;
const CONTROL_LAST_DROP_SEQUENCE = 10;

/**
 * Defines a numeric, fixed-layout row schema suitable for a row slab or ring.
 *
 * Browser SharedArrayBuffer use still requires the page to be cross-origin
 * isolated with COOP/COEP and should be runtime-probed. The same layout works
 * against ArrayBuffer so tests and non-isolated runtimes can use a copy/transfer
 * fallback without changing row encoding.
 */
export function defineSabRowSchema<const Fields extends readonly SabRowField[]>(
  relationName: string,
  fields: Fields
): SabRowSchema<Fields> {
  if (relationName.length === 0) {
    throw new Error('SAB row relationName must be non-empty');
  }

  const names = new Set<string>();

  for (const field of fields) {
    if (field.name.length === 0) {
      throw new Error('SAB row field names must be non-empty');
    }

    if (names.has(field.name)) {
      throw new Error(`duplicate SAB row field ${field.name}`);
    }

    names.add(field.name);
    scalarInfo(field.kind);
  }

  return { relationName, fields };
}

export function createSabRowLayout<const Fields extends readonly SabRowField[]>(
  schema: SabRowSchema<Fields>
): SabRowLayout<Fields> {
  const fields: SabFieldLayout[] = [];
  let offset = SLOT_HEADER_BYTES;

  for (const field of schema.fields) {
    const info = scalarInfo(field.kind);
    offset = alignTo(offset, info.alignment);
    fields.push({
      name: field.name,
      kind: field.kind,
      byteOffset: offset,
      byteLength: info.byteLength,
      alignment: info.alignment
    });
    offset += info.byteLength;
  }

  const slotBytes = alignTo(offset, 8);

  return {
    relationName: schema.relationName,
    fields,
    schema,
    controlBytes: CONTROL_BYTES,
    slotHeaderBytes: SLOT_HEADER_BYTES,
    payloadBytes: slotBytes - SLOT_HEADER_BYTES,
    slotBytes
  };
}

export function allocateSabRowBuffer(
  layout: SabRowLayout,
  capacity: number,
  options: { readonly shared?: boolean } = {}
): SabCompatibleBuffer {
  assertCapacity(capacity);
  const byteLength = requiredByteLength(layout, capacity);

  if (options.shared === true) {
    if (typeof SharedArrayBuffer !== 'function') {
      throw new Error('SharedArrayBuffer is not available in this runtime');
    }

    return new SharedArrayBuffer(byteLength);
  }

  return new ArrayBuffer(byteLength);
}

export function createSabRowRing<const Fields extends readonly SabRowField[]>(
  schema: SabRowSchema<Fields>,
  options: SabRowRingOptions
): SabRowRing<SabRowRecord<Fields>> {
  const layout = createSabRowLayout(schema);
  const buffer = allocateSabRowBuffer(
    layout,
    options.capacity,
    options.shared === undefined ? {} : { shared: options.shared }
  );
  return makeSabRowRing(schema, layout, buffer, options.capacity, true);
}

export function attachSabRowRing<const Fields extends readonly SabRowField[]>(
  schema: SabRowSchema<Fields>,
  options: SabRowRingAttachOptions
): SabRowRing<SabRowRecord<Fields>> {
  const layout = createSabRowLayout(schema);
  return makeSabRowRing(schema, layout, options.buffer, options.capacity, false);
}

function makeSabRowRing<const Fields extends readonly SabRowField[]>(
  schema: SabRowSchema<Fields>,
  layout: SabRowLayout<Fields>,
  buffer: SabCompatibleBuffer,
  capacity: number,
  initialize: boolean
): SabRowRing<SabRowRecord<Fields>> {
  assertCapacity(capacity);
  assertBufferLength(buffer, layout, capacity);

  const shared = isSharedBuffer(buffer);
  const control = new Int32Array(buffer, 0, CONTROL_WORDS);
  const words = new Int32Array(buffer);
  const view = new DataView(buffer);

  if (initialize) {
    initializeControl(control, layout, capacity, shared);
    clearSlots(words, layout, capacity, shared);
  } else {
    assertCompatibleControl(control, layout, capacity);
  }

  return {
    buffer,
    capacity,
    layout,
    shared,
    append(row) {
      return appendRow(schema, layout, capacity, control, words, view, shared, row);
    },
    commitRead(sequence) {
      commitReadSequence(control, capacity, shared, sequence);
    },
    diagnostics() {
      return transportDiagnostics(schema.relationName, capacity, control, shared);
    },
    readSnapshot(options) {
      return readSnapshot(schema, layout, capacity, control, words, view, shared, options);
    },
    traceRows(snapshot) {
      return traceRows(schema.relationName, snapshot ?? readSnapshot(schema, layout, capacity, control, words, view, shared));
    }
  };
}

function appendRow<Row extends Record<string, number>>(
  schema: SabRowSchema,
  layout: SabRowLayout,
  capacity: number,
  control: Int32Array,
  words: Int32Array,
  view: DataView,
  shared: boolean,
  row: Row
): SabAppendResult {
  const previousWrite = controlLoad(control, CONTROL_WRITE_SEQUENCE, shared);

  if (previousWrite >= MAX_SEQUENCE) {
    throw new Error('SAB row sequence exhausted for this prototype ring');
  }

  const sequence = previousWrite + 1;
  const readSequence = controlLoad(control, CONTROL_READ_SEQUENCE, shared);
  const pendingBeforeAppend = previousWrite - readSequence;
  let droppedRows = 0;

  if (pendingBeforeAppend >= capacity) {
    droppedRows = pendingBeforeAppend - capacity + 1;
    const nextReadSequence = readSequence + droppedRows;
    controlStore(control, CONTROL_READ_SEQUENCE, nextReadSequence, shared);
    controlAdd(control, CONTROL_DROPPED_ROWS, droppedRows, shared);
    controlAdd(control, CONTROL_OVERFLOW_EVENTS, 1, shared);
    controlStore(control, CONTROL_LAST_DROP_SEQUENCE, nextReadSequence, shared);
  }

  const slot = slotForSequence(sequence, capacity);
  writeRow(layout, view, slot, row);
  slotSequenceStore(words, layout, slot, sequence, shared);
  slotStatusStore(words, layout, slot, 0, shared);
  controlStore(control, CONTROL_WRITE_SEQUENCE, sequence, shared);
  controlAdd(control, CONTROL_APPEND_COUNT, 1, shared);

  const pendingRows = sequence - controlLoad(control, CONTROL_READ_SEQUENCE, shared);
  updateHighWatermark(control, pendingRows, shared);

  return {
    relationName: schema.relationName,
    sequence,
    slot,
    droppedRows,
    pendingRows,
    highWatermark: controlLoad(control, CONTROL_HIGH_WATERMARK, shared)
  };
}

function readSnapshot<Row extends Record<string, number>>(
  schema: SabRowSchema,
  layout: SabRowLayout,
  capacity: number,
  control: Int32Array,
  words: Int32Array,
  view: DataView,
  shared: boolean,
  options: SabReadOptions = {}
): SabReadSnapshot<Row> {
  const writeSequence = controlLoad(control, CONTROL_WRITE_SEQUENCE, shared);
  const committedReadSequence = controlLoad(control, CONTROL_READ_SEQUENCE, shared);
  const requestedAfter = options.afterSequence ?? committedReadSequence;
  const limit = options.limit ?? capacity;
  const oldestAvailableSequence = oldestAvailable(writeSequence, committedReadSequence, capacity);
  const readFromSequence = Math.max(requestedAfter + 1, oldestAvailableSequence);
  const throughSequence = limit <= 0 ? requestedAfter : Math.min(writeSequence, readFromSequence + limit - 1);
  const missedRows = Math.max(0, oldestAvailableSequence - requestedAfter - 1);
  const rows: SabSnapshotRow<Row>[] = [];

  for (let sequence = readFromSequence; sequence <= throughSequence; sequence += 1) {
    const slot = slotForSequence(sequence, capacity);
    const slotSequence = slotSequenceLoad(words, layout, slot, shared);

    if (slotSequence !== sequence) {
      continue;
    }

    rows.push({
      sequence,
      slot,
      values: readRow<Row>(layout, view, slot)
    });
  }

  return {
    relationName: schema.relationName,
    afterSequence: requestedAfter,
    oldestAvailableSequence,
    throughSequence,
    nextSequence: throughSequence + 1,
    missedRows,
    rows,
    diagnostics: transportDiagnostics(schema.relationName, capacity, control, shared)
  };
}

function traceRows<Row extends Record<string, number>>(
  relationName: string,
  snapshot: SabReadSnapshot<Row>
): readonly SabRowSurfaceTraceRow<Row>[] {
  const rows: SabRowSurfaceTraceRow<Row>[] = snapshot.rows.map((item) => ({
    row: 'sab_row_snapshot',
    relationName,
    sequence: item.sequence,
    slot: item.slot,
    ...item.values
  }) as SabRowSnapshotTraceRow<Row>);
  const diagnosticRows = diagnosticTraceRows(snapshot);
  rows.push(...diagnosticRows);
  return rows;
}

function diagnosticTraceRows<Row extends Record<string, number>>(
  snapshot: SabReadSnapshot<Row>
): SabRowDiagnosticTraceRow[] {
  const diagnostics = snapshot.diagnostics;
  const rows: SabRowDiagnosticTraceRow[] = [];

  if (snapshot.missedRows > 0) {
    rows.push(diagnosticTraceRow(snapshot, 'snapshot_missed_rows'));
  }

  if (diagnostics.droppedRows > 0) {
    rows.push(diagnosticTraceRow(snapshot, 'dropped_rows'));
  }

  if (diagnostics.backpressure) {
    rows.push(diagnosticTraceRow(snapshot, 'backpressure'));
  }

  return rows;
}

function diagnosticTraceRow<Row extends Record<string, number>>(
  snapshot: SabReadSnapshot<Row>,
  code: SabRowDiagnosticTraceRow['code']
): SabRowDiagnosticTraceRow {
  const diagnostics = snapshot.diagnostics;

  return {
    row: 'sab_row_diagnostic',
    relationName: snapshot.relationName,
    code,
    severity: 'warning',
    capacity: diagnostics.capacity,
    writeSequence: diagnostics.writeSequence,
    readSequence: diagnostics.readSequence,
    droppedRows: diagnostics.droppedRows,
    overflowEvents: diagnostics.overflowEvents,
    highWatermark: diagnostics.highWatermark,
    missedRows: snapshot.missedRows
  };
}

function writeRow<Row extends Record<string, number>>(
  layout: SabRowLayout,
  view: DataView,
  slot: number,
  row: Row
): void {
  const baseOffset = slotBaseOffset(layout, slot);

  for (const field of layout.fields) {
    const value = row[field.name];

    if (value === undefined) {
      throw new Error(`missing SAB row field ${field.name}`);
    }

    writeScalar(view, baseOffset + field.byteOffset, field.kind, value);
  }
}

function readRow<Row extends Record<string, number>>(
  layout: SabRowLayout,
  view: DataView,
  slot: number
): Row {
  const baseOffset = slotBaseOffset(layout, slot);
  const row: Record<string, number> = {};

  for (const field of layout.fields) {
    row[field.name] = readScalar(view, baseOffset + field.byteOffset, field.kind);
  }

  return row as Row;
}

function writeScalar(view: DataView, byteOffset: number, kind: SabScalarKind, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`SAB row field ${kind} value must be finite`);
  }

  switch (kind) {
    case 'f32':
      view.setFloat32(byteOffset, value, true);
      break;
    case 'f64':
      view.setFloat64(byteOffset, value, true);
      break;
    case 'i32':
      assertIntegerRange(kind, value, -2_147_483_648, 2_147_483_647);
      view.setInt32(byteOffset, value, true);
      break;
    case 'u32':
      assertIntegerRange(kind, value, 0, 4_294_967_295);
      view.setUint32(byteOffset, value, true);
      break;
  }
}

function readScalar(view: DataView, byteOffset: number, kind: SabScalarKind): number {
  switch (kind) {
    case 'f32':
      return view.getFloat32(byteOffset, true);
    case 'f64':
      return view.getFloat64(byteOffset, true);
    case 'i32':
      return view.getInt32(byteOffset, true);
    case 'u32':
      return view.getUint32(byteOffset, true);
  }
}

function transportDiagnostics(
  relationName: string,
  capacity: number,
  control: Int32Array,
  shared: boolean
): SabRowTransportDiagnostics {
  const writeSequence = controlLoad(control, CONTROL_WRITE_SEQUENCE, shared);
  const readSequence = controlLoad(control, CONTROL_READ_SEQUENCE, shared);
  const availableRows = Math.max(0, writeSequence - readSequence);

  return {
    relationName,
    capacity,
    shared,
    writeSequence,
    readSequence,
    availableRows,
    droppedRows: controlLoad(control, CONTROL_DROPPED_ROWS, shared),
    overflowEvents: controlLoad(control, CONTROL_OVERFLOW_EVENTS, shared),
    highWatermark: controlLoad(control, CONTROL_HIGH_WATERMARK, shared),
    backpressure: availableRows >= capacity
  };
}

function commitReadSequence(
  control: Int32Array,
  capacity: number,
  shared: boolean,
  sequence: number
): void {
  const writeSequence = controlLoad(control, CONTROL_WRITE_SEQUENCE, shared);
  const currentReadSequence = controlLoad(control, CONTROL_READ_SEQUENCE, shared);
  const nextReadSequence = Math.max(currentReadSequence, Math.min(writeSequence, sequence));
  const oldestSequence = oldestAvailable(writeSequence, currentReadSequence, capacity);
  controlStore(control, CONTROL_READ_SEQUENCE, Math.max(nextReadSequence, oldestSequence - 1), shared);
}

function initializeControl(
  control: Int32Array,
  layout: SabRowLayout,
  capacity: number,
  shared: boolean
): void {
  for (let index = 0; index < CONTROL_WORDS; index += 1) {
    controlStore(control, index, 0, shared);
  }

  controlStore(control, CONTROL_VERSION, TRANSPORT_VERSION, shared);
  controlStore(control, CONTROL_CAPACITY, capacity, shared);
  controlStore(control, CONTROL_SLOT_BYTES, layout.slotBytes, shared);
  controlStore(control, CONTROL_SHARED, shared ? 1 : 0, shared);
}

function clearSlots(words: Int32Array, layout: SabRowLayout, capacity: number, shared: boolean): void {
  for (let slot = 0; slot < capacity; slot += 1) {
    slotSequenceStore(words, layout, slot, 0, shared);
    slotStatusStore(words, layout, slot, 0, shared);
  }
}

function assertCompatibleControl(control: Int32Array, layout: SabRowLayout, capacity: number): void {
  if (control[CONTROL_VERSION] !== TRANSPORT_VERSION) {
    throw new Error('SAB row ring buffer has not been initialized with this prototype version');
  }

  if (control[CONTROL_CAPACITY] !== capacity || control[CONTROL_SLOT_BYTES] !== layout.slotBytes) {
    throw new Error('SAB row ring buffer layout does not match the requested schema');
  }
}

function oldestAvailable(writeSequence: number, readSequence: number, capacity: number): number {
  if (writeSequence === 0) {
    return 1;
  }

  return Math.max(readSequence + 1, writeSequence - capacity + 1);
}

function slotForSequence(sequence: number, capacity: number): number {
  return (sequence - 1) % capacity;
}

function slotBaseOffset(layout: SabRowLayout, slot: number): number {
  return CONTROL_BYTES + slot * layout.slotBytes;
}

function slotSequenceWordOffset(layout: SabRowLayout, slot: number): number {
  return (slotBaseOffset(layout, slot) + SLOT_SEQUENCE_BYTE_OFFSET) / Int32Array.BYTES_PER_ELEMENT;
}

function slotStatusWordOffset(layout: SabRowLayout, slot: number): number {
  return (slotBaseOffset(layout, slot) + SLOT_STATUS_BYTE_OFFSET) / Int32Array.BYTES_PER_ELEMENT;
}

function slotSequenceLoad(words: Int32Array, layout: SabRowLayout, slot: number, shared: boolean): number {
  return controlLoad(words, slotSequenceWordOffset(layout, slot), shared);
}

function slotSequenceStore(
  words: Int32Array,
  layout: SabRowLayout,
  slot: number,
  sequence: number,
  shared: boolean
): void {
  controlStore(words, slotSequenceWordOffset(layout, slot), sequence, shared);
}

function slotStatusStore(
  words: Int32Array,
  layout: SabRowLayout,
  slot: number,
  status: number,
  shared: boolean
): void {
  controlStore(words, slotStatusWordOffset(layout, slot), status, shared);
}

function updateHighWatermark(control: Int32Array, pendingRows: number, shared: boolean): void {
  if (!shared) {
    control[CONTROL_HIGH_WATERMARK] = Math.max(control[CONTROL_HIGH_WATERMARK] ?? 0, pendingRows);
    return;
  }

  let current = Atomics.load(control, CONTROL_HIGH_WATERMARK);
  while (pendingRows > current) {
    const previous = Atomics.compareExchange(control, CONTROL_HIGH_WATERMARK, current, pendingRows);

    if (previous === current) {
      return;
    }

    current = previous;
  }
}

function controlLoad(control: Int32Array, index: number, shared: boolean): number {
  return shared ? Atomics.load(control, index) : control[index] ?? 0;
}

function controlStore(control: Int32Array, index: number, value: number, shared: boolean): void {
  if (shared) {
    Atomics.store(control, index, value);
    return;
  }

  control[index] = value;
}

function controlAdd(control: Int32Array, index: number, value: number, shared: boolean): number {
  if (shared) {
    return Atomics.add(control, index, value);
  }

  const previous = control[index] ?? 0;
  control[index] = previous + value;
  return previous;
}

function scalarInfo(kind: SabScalarKind): { readonly byteLength: number; readonly alignment: number } {
  switch (kind) {
    case 'f32':
    case 'i32':
    case 'u32':
      return { byteLength: 4, alignment: 4 };
    case 'f64':
      return { byteLength: 8, alignment: 8 };
  }
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function requiredByteLength(layout: SabRowLayout, capacity: number): number {
  return CONTROL_BYTES + layout.slotBytes * capacity;
}

function assertBufferLength(buffer: SabCompatibleBuffer, layout: SabRowLayout, capacity: number): void {
  const required = requiredByteLength(layout, capacity);

  if (buffer.byteLength < required) {
    throw new Error(`SAB row buffer requires ${required} bytes, received ${buffer.byteLength}`);
  }
}

function assertCapacity(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error('SAB row ring capacity must be a positive integer');
  }
}

function assertIntegerRange(kind: SabScalarKind, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`SAB row ${kind} value ${value} is outside ${min}..${max}`);
  }
}

function isSharedBuffer(buffer: SabCompatibleBuffer): boolean {
  return typeof SharedArrayBuffer === 'function' && buffer instanceof SharedArrayBuffer;
}
