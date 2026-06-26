import { describe, expect, it } from 'vitest';
import { containsSampleLeak, summarizeBody } from './connector-event.js';

describe('connector event privacy helpers', () => {
  it('summarizes message bodies without returning body text', () => {
    const summary = summarizeBody('private launch plan\nhttps://example.test/secret');

    expect(summary).toEqual({
      bodyBytes: 47,
      bodyLines: 2,
      linkCount: 1
    });
    expect(containsSampleLeak(summary, ['private launch plan', 'secret'])).toBe(false);
  });
});
