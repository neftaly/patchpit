import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { createSandboxFrameAttributes, createSandboxUrlMount } from './index.ts';
import { respondWithSandboxUrlMount } from './node.ts';

void test('sandbox mount segment behavior fuzz', async () => {
  for (const invalidSegment of ['', '.', '..']) {
    assert.throws(
      () => createSandboxFrameAttributes({
        baseUrl: 'https://patchpit.test/',
        entry: ['index.html'],
        mountId: invalidSegment,
      }),
      /non-empty, non-dot segments/,
    );
    assert.throws(
      () => createSandboxFrameAttributes({
        baseUrl: 'https://patchpit.test/',
        entry: ['index.html'],
        mountId: 'mount-1',
        route: ['__patchpit', invalidSegment],
      }),
      /non-empty, non-dot segments/,
    );
  }

  for (const validSegment of ['mount-1', 'a/b', '%2e', 'space here', '\u65e5\u672c\u8a9e']) {
    const mount = createSandboxUrlMount({
      baseUrl: 'https://patchpit.test/',
      entry: ['index.html'],
      files: [{ path: ['index.html'], read: () => ({ body: 'ok' }) }],
      mountId: validSegment,
    });
    assert.equal((await mount.respond(new Request(mount.frameAttributes.src)))?.status, 200);
  }
});

void test('node sandbox request boundary behavior fuzz', async () => {
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    files: [{ path: ['index.html'], read: () => ({ body: 'ok', contentType: 'text/plain' }) }],
    mountId: 'mount-1',
  });

  for (const host of ['bad host', '[', ']', '%', 'patchpit.test:invalid']) {
    const nodeResponse = createNodeResponse();
    const handled = await respondWithSandboxUrlMount(
      mount,
      createNodeRequest(host, 'GET'),
      nodeResponse.response,
    );
    assert.equal(handled, true);
    assert.equal(nodeResponse.status, 200);
    assert.equal(nodeResponse.body, 'ok');
  }

  for (const method of ['CONNECT', 'TRACE', 'TRACK']) {
    const nodeResponse = createNodeResponse();
    const handled = await respondWithSandboxUrlMount(
      mount,
      createNodeRequest('patchpit.test', method),
      nodeResponse.response,
    );
    assert.equal(handled, true);
    assert.equal(nodeResponse.status, 405);
    assert.equal(nodeResponse.headers.allow, 'GET, HEAD');
  }
});

const createNodeRequest = (host: string, method: string): IncomingMessage => ({
  headers: { host },
  method,
  url: '/__patchpit/sandbox/mount-1/index.html',
}) as IncomingMessage;

const createNodeResponse = () => {
  const state: {
    readonly headers: Record<string, string>;
    body: string | undefined;
    readonly response: ServerResponse;
    status: number | undefined;
  } = {
    body: undefined,
    headers: {},
    response: undefined as unknown as ServerResponse,
    status: undefined,
  };
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
