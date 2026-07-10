import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { createSandboxUrlMount } from './index.ts';
import { respondWithSandboxUrlMount } from './node.ts';

void test('node sandbox URL mounts reject non-GET and non-HEAD methods without reading files', async () => {
  let reads = 0;
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    files: [{
      path: ['index.html'],
      read: () => {
        reads += 1;
        return { body: '<!doctype html>', contentType: 'text/html' };
      },
    }],
    mountId: 'mount-1',
  });
  const nodeResponse = createNodeResponse();

  const handled = await respondWithSandboxUrlMount(
    mount,
    createNodeRequest('/__patchpit/sandbox/mount-1/index.html', 'POST'),
    nodeResponse.response,
  );

  assert.equal(handled, true);
  assert.equal(reads, 0);
  assert.equal(nodeResponse.status, 405);
  assert.equal(nodeResponse.headers.allow, 'GET, HEAD');
  assert.equal(nodeResponse.body, 'Method not allowed');
});

void test('node sandbox URL mounts leave unrelated non-GET requests unhandled', async () => {
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    files: [{ path: ['index.html'], read: () => ({ body: '', contentType: 'text/html' }) }],
    mountId: 'mount-1',
  });
  const nodeResponse = createNodeResponse();

  const handled = await respondWithSandboxUrlMount(
    mount,
    createNodeRequest('/elsewhere/index.html', 'POST'),
    nodeResponse.response,
  );

  assert.equal(handled, false);
  assert.equal(nodeResponse.status, undefined);
});

void test('node sandbox URL mounts reject methods forbidden by Fetch', async () => {
  let reads = 0;
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    files: [{
      path: ['index.html'],
      read: () => {
        reads += 1;
        return { body: '', contentType: 'text/html' };
      },
    }],
    mountId: 'mount-1',
  });
  const nodeResponse = createNodeResponse();

  const handled = await respondWithSandboxUrlMount(
    mount,
    createNodeRequest('/__patchpit/sandbox/mount-1/index.html', 'TRACE'),
    nodeResponse.response,
  );

  assert.equal(handled, true);
  assert.equal(reads, 0);
  assert.equal(nodeResponse.status, 405);
  assert.equal(nodeResponse.headers.allow, 'GET, HEAD');
  assert.equal(nodeResponse.body, 'Method not allowed');
});

const createNodeRequest = (url: string, method: string): IncomingMessage => ({
  headers: { host: 'patchpit.test' },
  method,
  url,
}) as IncomingMessage;

const createNodeResponse = (): {
  readonly response: ServerResponse;
  readonly headers: Record<string, string>;
  body: string | undefined;
  status?: number;
} => {
  const state: {
    readonly headers: Record<string, string>;
    body: string | undefined;
    status?: number;
  } = { body: undefined, headers: {} };
  const response = {
    end: (chunk?: Uint8Array) => {
      state.body = chunk === undefined ? undefined : Buffer.from(chunk).toString('utf8');
      return response;
    },
    writeHead: (status: number, headers: Record<string, string>) => {
      state.status = status;
      Object.assign(state.headers, headers);
      return response;
    },
  } as unknown as ServerResponse;
  return Object.assign(state, { response });
};
