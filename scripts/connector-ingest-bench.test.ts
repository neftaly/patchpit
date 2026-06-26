import { describe, expect, it } from 'vitest';
import { containsSampleLeak, parseDiscordMessagesCsv, parseGmailMbox } from '../packages/connectors/src/index.js';

type BenchRow = {
  readonly scenario: string;
  readonly rows: number;
  readonly medianMs: string;
  readonly p95Ms: string;
  readonly rowsPerMs: string;
  readonly privateBodyKb: string;
  readonly rejected: number;
};

describe('connector ingest benchmarks', () => {
  it('reports local import throughput and privacy leak checks', () => {
    const rows: BenchRow[] = [];

    for (const size of [100, 1_000, 5_000]) {
      rows.push(benchDiscord(size));
      rows.push(benchGmail(size));
    }

    console.table(rows);
    expect(rows.every((row) => Number(row.medianMs) > 0)).toBe(true);
  }, 120_000);
});

function benchDiscord(rows: number): BenchRow {
  const input = makeDiscordCsv(rows);
  const samples = runSamples(() => {
    const result = parseDiscordMessagesCsv(input, {
      accountHint: 'creator@example.test',
      channelId: 'i-and-s'
    });

    expect(result.events).toHaveLength(rows);
    expect(result.diagnostics).toEqual([]);
    expect(containsSampleLeak(result, ['private launch plan', 'creator@example.test'])).toBe(false);
    return result.metrics.privateBodyBytes;
  });

  return toBenchRow('discord data package csv', rows, samples);
}

function benchGmail(rows: number): BenchRow {
  const input = makeGmailMbox(rows);
  const samples = runSamples(() => {
    const result = parseGmailMbox(input, {
      accountHint: 'creator@example.test'
    });

    expect(result.events).toHaveLength(rows);
    expect(result.diagnostics).toEqual([]);
    expect(containsSampleLeak(result, ['private launch plan', 'creator@example.test'])).toBe(false);
    return result.metrics.privateBodyBytes;
  });

  return toBenchRow('gmail mbox', rows, samples);
}

function runSamples(callback: () => number): readonly Sample[] {
  const samples: Sample[] = [];

  for (let index = 0; index < 5; index += 1) {
    const start = performance.now();
    const privateBodyBytes = callback();
    samples.push({
      ms: performance.now() - start,
      privateBodyBytes
    });
  }

  return samples;
}

type Sample = {
  readonly ms: number;
  readonly privateBodyBytes: number;
};

function toBenchRow(scenario: string, rows: number, samples: readonly Sample[]): BenchRow {
  const durations = samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const medianMs = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  const privateBodyBytes = Math.max(...samples.map((sample) => sample.privateBodyBytes));

  return {
    medianMs: fixed(medianMs),
    p95Ms: fixed(p95Ms),
    privateBodyKb: fixed(privateBodyBytes / 1024),
    rejected: 0,
    rows,
    rowsPerMs: fixed(rows / medianMs),
    scenario
  };
}

function makeDiscordCsv(rows: number): string {
  const records = ['ID,Timestamp,Contents,Attachments'];

  for (let index = 0; index < rows; index += 1) {
    records.push([
      `d-${index}`,
      new Date(Date.UTC(2026, 5, 25, 12, 0, index % 60)).toISOString(),
      csvEscape(`private launch plan ${index} https://example.test/${index}`),
      index % 10 === 0 ? `https://cdn.example.test/${index}.png` : ''
    ].join(','));
  }

  return records.join('\n');
}

function makeGmailMbox(rows: number): string {
  const records: string[] = [];

  for (let index = 0; index < rows; index += 1) {
    records.push([
      `From sender@example.test Thu Jun 25 12:${String(index % 60).padStart(2, '0')}:00 2026`,
      `Message-ID: <g-${index}@example.test>`,
      `Date: Thu, 25 Jun 2026 12:${String(index % 60).padStart(2, '0')}:00 +0000`,
      'From: Creator <creator@example.test>',
      'To: Collaborator <collaborator@example.test>',
      'Subject: private launch plan',
      'X-Gmail-Labels: Inbox',
      '',
      `private launch plan ${index}`,
      `https://example.test/${index}`,
      index % 12 === 0 ? 'Content-Disposition: attachment; filename="note.pdf"' : ''
    ].join('\n'));
  }

  return records.join('\n');
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(2);
}
