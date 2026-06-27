import { describe, expect, it } from 'vitest';
import { containsSampleLeak } from './connector-event.js';
import { parseGmailMbox } from './gmail-mbox.js';

describe('Gmail mbox import', () => {
  it('normalizes mbox messages without retaining subjects or bodies', () => {
    const result = parseGmailMbox([
      'From sender@example.test Thu Jun 25 12:00:00 2026',
      'Message-ID: <one@example.test>',
      'Date: Thu, 25 Jun 2026 12:00:00 +0000',
      'From: Sender <sender@example.test>',
      'To: Receiver <receiver@example.test>',
      'Subject: private launch plan',
      'X-Gmail-Labels: Inbox,Important',
      '',
      'Do not leak the investor note.',
      'https://example.test/private',
      'From sender@example.test Thu Jun 25 12:01:00 2026',
      'Message-ID: <two@example.test>',
      'Date: Thu, 25 Jun 2026 12:01:00 +0000',
      'From: Sender <sender@example.test>',
      'To: Receiver <receiver@example.test>',
      'Subject: private launch plan',
      '',
      'Content-Disposition: attachment; filename="plan.pdf"',
      ''
    ].join('\n'));

    expect(result.diagnostics).toEqual([]);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      bodyLines: 2,
      kind: 'gmail',
      labels: ['Inbox', 'Important'],
      linkCount: 1,
      recipientKeys: expect.any(Array),
      sentAt: '2026-06-25T12:00:00.000Z',
      source: 'gmail-mbox'
    });
    expect(result.events[1]?.attachmentCount).toBe(1);
    expect(result.events[0]?.conversationKey).toBe(result.events[1]?.conversationKey);
    expect(containsSampleLeak(result, ['private launch plan', 'investor note', 'sender@example.test'])).toBe(false);
  });

  it('rejects mbox messages with missing or invalid dates', () => {
    const result = parseGmailMbox([
      'From sender@example.test Thu Jun 25 12:00:00 2026',
      'Message-ID: <one@example.test>',
      'Subject: Missing date',
      '',
      'body',
      'From sender@example.test Thu Jun 25 12:01:00 2026',
      'Message-ID: <two@example.test>',
      'Date: not a date',
      '',
      'body'
    ].join('\n'));

    expect(result.events).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'missing_timestamp',
      'invalid_date'
    ]);
  });
});
