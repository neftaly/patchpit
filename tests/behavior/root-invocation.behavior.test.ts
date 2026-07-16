import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalRootInvocationHash,
  defaultRootSync,
  parseRootInvocationHash,
} from '../../src/root/invocation.ts';

const validSrc = 'automerge:4NMNnkMhL8jXrdJ9jamS58PAVdXu';
const parse = (hash: string) => parseRootInvocationHash(hash, (value) => value === validSrc);

void test('root invocation defaults sync and preserves opaque delegation', () => {
  assert.deepEqual(parse(''), { ok: true, value: { sync: defaultRootSync } });
  assert.deepEqual(parse(`#${JSON.stringify({ src: validSrc, delegation: 'opaque%20%7B' })}`), {
    ok: true,
    value: { src: validSrc, sync: defaultRootSync, delegation: 'opaque%20%7B' },
  });
  assert.deepEqual(parse(encodeURIComponent(JSON.stringify({ sync: ['wss://example.test'], delegation: 'encoded' }))), {
    ok: true,
    value: { sync: ['wss://example.test'], delegation: 'encoded' },
  });
});

void test('root invocation canonicalizes its complete recognized shape', () => {
  const result = parse(`#${JSON.stringify({ src: validSrc, delegation: 'opaque' })}`);
  assert.equal(result.ok, true);
  if (result.ok) {
    const canonical = canonicalRootInvocationHash({ ...result.value, delegation: '50% %7B' });
    assert.equal(canonical,
      `#${JSON.stringify({ src: validSrc, sync: defaultRootSync, delegation: '50% %7B' })}`);
    assert.deepEqual(parse(canonical), {
      ok: true,
      value: { src: validSrc, sync: defaultRootSync, delegation: '50% %7B' },
    });
  }
});

void test('root invocation rejects malformed and unrecognized input explicitly', () => {
  const cases = [
    ['#%XX', 'decode'],
    ['#{', 'json'],
    ['#[]', 'object'],
    ['#{"extra":true}', 'unknown'],
    ['#{"src":"automerge:invalid"}', 'src'],
    ['#{"sync":"wss://sync.automerge.org"}', 'sync'],
    ['#{"sync":[]}', 'sync'],
    ['#{"sync":[1]}', 'sync'],
    ['#{"delegation":null}', 'delegation'],
    ['#{"delegation":{}}', 'delegation'],
  ] as const;
  for (const [hash, error] of cases) assert.deepEqual(parse(hash), { ok: false, error });
});
