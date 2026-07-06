import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHashLaunchConfig } from './launch-from-hash.ts';

void test('parseHashLaunchConfig returns empty for an empty hash', () => {
  assert.deepEqual(parseHashLaunchConfig(''), { status: 'empty' });
  assert.deepEqual(parseHashLaunchConfig('#'), { status: 'empty' });
});

void test('parseHashLaunchConfig accepts raw JSON object hash src', () => {
  assert.deepEqual(parseHashLaunchConfig('#{"src":"automerge:readme"}'), {
    status: 'ready',
    src: 'automerge:readme',
  });
});

void test('parseHashLaunchConfig accepts encoded JSON object hash src', () => {
  assert.deepEqual(parseHashLaunchConfig('#%7B%22src%22%3A%22%2Fhome%2Fdocs%2FREADME.md%22%7D'), {
    status: 'ready',
    src: '/home/docs/README.md',
  });
});

void test('parseHashLaunchConfig ignores delegation in route hash config', () => {
  assert.deepEqual(parseHashLaunchConfig('#{"src":"/home/docs/README.md","delegation":"delegation:test"}'), {
    status: 'ready',
    src: '/home/docs/README.md',
  });
});

void test('parseHashLaunchConfig rejects non-object hash config', () => {
  const parsed = parseHashLaunchConfig('#["/home/docs/README.md"]');

  assert.equal(parsed.status, 'invalid');
  assert.equal(parsed.message, 'Hash launch config must be a JSON object.');
});

void test('parseHashLaunchConfig rejects malformed JSON hash config', () => {
  const parsed = parseHashLaunchConfig('#{"src":');

  assert.equal(parsed.status, 'invalid');
  assert.equal(parsed.message, 'Hash launch config is malformed JSON.');
});

void test('parseHashLaunchConfig rejects missing or unsupported src', () => {
  for (const hash of ['#{}', '#{"src":42}', '#{"src":""}']) {
    const parsed = parseHashLaunchConfig(hash);
    assert.equal(parsed.status, 'invalid');
    assert.equal(parsed.message, 'Hash launch config requires a string src.');
  }
});

void test('parseHashLaunchConfig rejects non-JSON object hash', () => {
  const parsed = parseHashLaunchConfig('#README.md');

  assert.equal(parsed.status, 'invalid');
  assert.equal(parsed.message, 'Hash launch config must be a JSON object.');
});
