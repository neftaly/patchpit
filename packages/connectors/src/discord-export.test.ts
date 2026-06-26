import { describe, expect, it } from 'vitest';
import { containsSampleLeak } from './connector-event.js';
import { parseDiscordMessagesCsv } from './discord-export.js';

describe('Discord data package import', () => {
  it('normalizes message CSV rows without retaining raw contents', () => {
    const result = parseDiscordMessagesCsv(
      [
        'ID,Timestamp,Contents,Attachments',
        '123,2026-06-25T12:00:00.000Z,"private launch plan, do not leak",',
        '124,2026-06-25T12:01:00.000Z,"link https://example.test/private",https://cdn.example.test/a.png'
      ].join('\n'),
      {
        accountHint: 'user@example.test',
        channelId: 'channel-1',
        channelName: 'i-and-s'
      }
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.events).toHaveLength(2);
    expect(result.metrics).toMatchObject({
      acceptedEvents: 2,
      attachmentCount: 1,
      rejectedRecords: 0
    });
    expect(result.events[0]).toMatchObject({
      attachmentCount: 0,
      bodyLines: 1,
      kind: 'discord',
      labels: ['channel:i-and-s'],
      sentAt: '2026-06-25T12:00:00.000Z',
      source: 'discord-data-package'
    });
    expect(result.events[1]?.linkCount).toBe(1);
    expect(containsSampleLeak(result, ['private launch plan', 'do not leak', 'https://example.test/private'])).toBe(false);
  });

  it('rejects rows missing ids or timestamps', () => {
    const result = parseDiscordMessagesCsv([
      'ID,Timestamp,Contents',
      ',2026-06-25T12:00:00.000Z,missing id',
      '124,,missing timestamp',
      '125,not a date,bad timestamp'
    ].join('\n'));

    expect(result.events).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'missing_id',
      'missing_timestamp',
      'invalid_date'
    ]);
  });
});
