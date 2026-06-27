import { describe, expect, it } from 'vitest';
import {
  attachSabRowRing,
  createSabRowLayout,
  createSabRowRing,
  defineSabRowSchema,
  sabTraceEventCode,
  tarstateWorkerTraceSchema,
  type SabRowRecord
} from './sab-row-surface-prototype.js';

const royalFrameSurfaceSchema = defineSabRowSchema('royal_frame_surface', [
  { name: 'frame', kind: 'u32' },
  { name: 'pointerX', kind: 'f64' },
  { name: 'pointerY', kind: 'f64' },
  { name: 'targetId', kind: 'u32' },
  { name: 'flags', kind: 'u32' }
] as const);

type RoyalFrameSurfaceRow = SabRowRecord<typeof royalFrameSurfaceSchema.fields>;
type TarstateWorkerTraceRow = SabRowRecord<typeof tarstateWorkerTraceSchema.fields>;

const transportModes = [
  { label: 'ArrayBuffer fallback', shared: false },
  ...(
    typeof SharedArrayBuffer === 'function'
      ? [{ label: 'SharedArrayBuffer', shared: true }]
      : []
  )
] as const;

describe('SAB row surface prototype', () => {
  it('computes an aligned fixed-layout schema for row slots', () => {
    const layout = createSabRowLayout(royalFrameSurfaceSchema);

    expect(layout.controlBytes).toBe(48);
    expect(layout.slotHeaderBytes).toBe(8);
    expect(layout.payloadBytes).toBe(32);
    expect(layout.slotBytes).toBe(40);
    expect(layout.fields).toEqual([
      { name: 'frame', kind: 'u32', byteOffset: 8, byteLength: 4, alignment: 4 },
      { name: 'pointerX', kind: 'f64', byteOffset: 16, byteLength: 8, alignment: 8 },
      { name: 'pointerY', kind: 'f64', byteOffset: 24, byteLength: 8, alignment: 8 },
      { name: 'targetId', kind: 'u32', byteOffset: 32, byteLength: 4, alignment: 4 },
      { name: 'flags', kind: 'u32', byteOffset: 36, byteLength: 4, alignment: 4 }
    ]);
  });

  for (const mode of transportModes) {
    it(`reads deterministic producer/consumer snapshots over ${mode.label}`, () => {
      const producer = createSabRowRing(royalFrameSurfaceSchema, {
        capacity: 4,
        shared: mode.shared
      });
      const consumer = attachSabRowRing(royalFrameSurfaceSchema, {
        capacity: 4,
        buffer: producer.buffer
      });

      expect(producer.shared).toBe(mode.shared);
      expect(consumer.shared).toBe(mode.shared);
      expect(producer.append(frameRow(10, 1.5, 2.5, 101, 1))).toMatchObject({
        sequence: 1,
        slot: 0,
        droppedRows: 0,
        pendingRows: 1,
        highWatermark: 1
      });
      expect(producer.append(frameRow(11, 3.5, 4.5, 102, 0))).toMatchObject({
        sequence: 2,
        slot: 1,
        droppedRows: 0,
        pendingRows: 2,
        highWatermark: 2
      });

      const firstSnapshot = consumer.readSnapshot({ afterSequence: 0 });
      expect(firstSnapshot.rows).toEqual([
        { sequence: 1, slot: 0, values: frameRow(10, 1.5, 2.5, 101, 1) },
        { sequence: 2, slot: 1, values: frameRow(11, 3.5, 4.5, 102, 0) }
      ]);
      expect(firstSnapshot.diagnostics).toMatchObject({
        writeSequence: 2,
        readSequence: 0,
        availableRows: 2,
        droppedRows: 0
      });

      consumer.commitRead(firstSnapshot.throughSequence);
      expect(producer.diagnostics()).toMatchObject({
        writeSequence: 2,
        readSequence: 2,
        availableRows: 0,
        droppedRows: 0
      });

      producer.append(frameRow(12, 5.5, 6.5, 103, 1));

      const nextSnapshot = consumer.readSnapshot();
      expect(nextSnapshot.afterSequence).toBe(2);
      expect(nextSnapshot.rows).toEqual([
        { sequence: 3, slot: 2, values: frameRow(12, 5.5, 6.5, 103, 1) }
      ]);
      expect(consumer.traceRows(nextSnapshot)).toEqual([
        {
          row: 'sab_row_snapshot',
          relationName: 'royal_frame_surface',
          sequence: 3,
          slot: 2,
          ...frameRow(12, 5.5, 6.5, 103, 1)
        }
      ]);
    });
  }

  it('reports overflow, dropped rows, and backpressure when the consumer lags', () => {
    const ring = createSabRowRing(royalFrameSurfaceSchema, {
      capacity: 2,
      shared: false
    });

    ring.append(frameRow(1, 10, 20, 201, 0));
    ring.append(frameRow(2, 11, 21, 202, 0));
    expect(ring.append(frameRow(3, 12, 22, 203, 1))).toMatchObject({
      sequence: 3,
      slot: 0,
      droppedRows: 1,
      pendingRows: 2,
      highWatermark: 2
    });

    expect(ring.diagnostics()).toMatchObject({
      writeSequence: 3,
      readSequence: 1,
      availableRows: 2,
      droppedRows: 1,
      overflowEvents: 1,
      highWatermark: 2,
      backpressure: true
    });

    const snapshot = ring.readSnapshot({ afterSequence: 0 });
    expect(snapshot.missedRows).toBe(1);
    expect(snapshot.oldestAvailableSequence).toBe(2);
    expect(snapshot.rows).toEqual([
      { sequence: 2, slot: 1, values: frameRow(2, 11, 21, 202, 0) },
      { sequence: 3, slot: 0, values: frameRow(3, 12, 22, 203, 1) }
    ]);
    expect(ring.traceRows(snapshot).filter((row) => row.row === 'sab_row_diagnostic')).toEqual([
      {
        row: 'sab_row_diagnostic',
        relationName: 'royal_frame_surface',
        code: 'snapshot_missed_rows',
        severity: 'warning',
        capacity: 2,
        writeSequence: 3,
        readSequence: 1,
        droppedRows: 1,
        overflowEvents: 1,
        highWatermark: 2,
        missedRows: 1
      },
      {
        row: 'sab_row_diagnostic',
        relationName: 'royal_frame_surface',
        code: 'dropped_rows',
        severity: 'warning',
        capacity: 2,
        writeSequence: 3,
        readSequence: 1,
        droppedRows: 1,
        overflowEvents: 1,
        highWatermark: 2,
        missedRows: 1
      },
      {
        row: 'sab_row_diagnostic',
        relationName: 'royal_frame_surface',
        code: 'backpressure',
        severity: 'warning',
        capacity: 2,
        writeSequence: 3,
        readSequence: 1,
        droppedRows: 1,
        overflowEvents: 1,
        highWatermark: 2,
        missedRows: 1
      }
    ]);
  });

  it('uses the same fixed-row code for tarstate trace rows on ArrayBuffer fallback', () => {
    const writer = createSabRowRing(tarstateWorkerTraceSchema, {
      capacity: 2,
      shared: false
    });
    const reader = attachSabRowRing(tarstateWorkerTraceSchema, {
      capacity: 2,
      buffer: writer.buffer
    });
    const traceRow: TarstateWorkerTraceRow = {
      at: 100.25,
      order: 7,
      sourceId: 42,
      eventCode: sabTraceEventCode.append,
      sequence: 1,
      slot: 0,
      value0: 12.5,
      value1: 33.75,
      flags: 3
    };

    expect(writer.buffer).toBeInstanceOf(ArrayBuffer);
    expect(writer.shared).toBe(false);
    writer.append(traceRow);

    expect(reader.readSnapshot({ afterSequence: 0 }).rows).toEqual([
      { sequence: 1, slot: 0, values: traceRow }
    ]);
  });
});

function frameRow(
  frame: number,
  pointerX: number,
  pointerY: number,
  targetId: number,
  flags: number
): RoyalFrameSurfaceRow {
  return {
    frame,
    pointerX,
    pointerY,
    targetId,
    flags
  };
}
