import { describe, expect, it } from 'vitest';
import { infinigenStreamUrl, parseInfinigenHash } from './args';

describe('Infinigen URL args', () => {
  it('prefers explicit JSON hash args for shareable URLs', () => {
    expect(parseInfinigenHash('#JSON({"seed":"ridge","doc":"automerge:abc"}).not-json')).toEqual({
      error: 'Invalid Infinigen args'
    });
    expect(parseInfinigenHash('#JSON({"seed":"ridge","doc":"automerge:abc"})')).toEqual({
      doc: 'automerge:abc',
      seed: 'ridge'
    });
    expect(parseInfinigenHash('#JSON({"seed":"ridge","quality":"ultra"})')).toEqual({
      quality: 'ultra',
      seed: 'ridge'
    });
    expect(parseInfinigenHash('#JSON({"preset":"linz-nz","quality":"high","seed":"tamaki"})')).toEqual({
      preset: 'linz-nz',
      quality: 'high',
      seed: 'tamaki'
    });
  });

  it('keeps plain JSON hash support for Patchpit app URLs', () => {
    expect(parseInfinigenHash('#{"seed":"plain"}')).toEqual({ seed: 'plain' });
    expect(parseInfinigenHash('#{"doc":"automerge:abc","sync":["ws://127.0.0.1:3030"],"delegation":"keyhive-prototype","speech":"browser"}')).toEqual({
      delegation: 'keyhive-prototype',
      doc: 'automerge:abc',
      speech: 'browser',
      sync: ['ws://127.0.0.1:3030']
    });
    expect(parseInfinigenHash('#%7B%22doc%22%3A%22automerge%3Aabc%22%2C%22delegation%22%3A%22keyhive-prototype%22%7D')).toEqual({
      delegation: 'keyhive-prototype',
      doc: 'automerge:abc'
    });
  });

  it('accepts doc shorthand while Automerge wiring is still external', () => {
    expect(parseInfinigenHash('#doc=automerge:2WzA&seed=shared&quality=balanced&preset=linz-nz&delegation=prototype&sync=ws://one&sync=ws://two')).toEqual({
      delegation: 'prototype',
      doc: 'automerge:2WzA',
      preset: 'linz-nz',
      quality: 'balanced',
      seed: 'shared',
      sync: ['ws://one', 'ws://two']
    });
  });

  it('keeps doc, sync, and delegation out of stream query strings', () => {
    expect(infinigenStreamUrl('http://example.test/infinigen/index.html#{"doc":"automerge:y"}', {
      delegation: 'keyhive-prototype',
      doc: 'automerge:y',
      speech: 'browser',
      sync: ['wss://sync.example.test']
    })).toBe('http://example.test/infinigen/api/infinigen/scene.ndjson');
  });

  it('passes render knobs only when explicitly requested for dev URLs', () => {
    expect(infinigenStreamUrl('http://example.test/infinigen/index.html#JSON({"seed":"x"})', {
      doc: 'automerge:y',
      seed: 'x'
    })).toBe('http://example.test/infinigen/api/infinigen/scene.ndjson?seed=x');
    expect(infinigenStreamUrl('http://example.test/infinigen/index.html#doc=automerge:y', {
      doc: 'automerge:y',
      preset: 'linz-nz',
      quality: 'ultra'
    })).toBe('http://example.test/infinigen/api/infinigen/scene.ndjson?quality=ultra&preset=linz-nz');
  });

  it('rejects unsupported hash payloads', () => {
    expect(parseInfinigenHash('#not-json')).toEqual({ error: 'Invalid Infinigen args' });
    expect(parseInfinigenHash('#JSON([])')).toEqual({ error: 'Invalid Infinigen args' });
  });
});
