import assert from 'node:assert/strict';
import test from 'node:test';
import {
  routeIntentSchemaId,
  routeOpenIntent,
  routeRequestsRelation,
} from '@patchpit/system/runtime';
import { submitRouteIntent } from './route-intents.ts';

void test('submitRouteIntent sends valid rows through the runtime client', async () => {
  const result = { status: 'queued', ticket: 'route-test' };
  const requests = [];
  const runtime = {
    submitIntent(request) {
      requests.push(request);
      return Promise.resolve(result);
    },
  };

  const actual = await submitRouteIntent(runtime, routeOpenIntent, {
    rootUrl: 'root',
    title: 'Document',
    url: 'doc',
  });

  assert.equal(actual, result);
  assert.equal(requests.length, 1);

  const request = requests[0];
  assert.equal(request.intent, routeOpenIntent);
  assert.equal(request.input.schemaId, routeIntentSchemaId);
  assert.equal(request.idempotencyKey, request.input.relations[routeRequestsRelation][0].id);
  assert.deepEqual(request.input.relations[routeRequestsRelation][0], {
    id: request.idempotencyKey,
    rootUrl: 'root',
    title: 'Document',
    url: 'doc',
  });
});

void test('submitRouteIntent rejects malformed builder rows through the returned promise', async () => {
  let submitIntentCalls = 0;
  const runtime = {
    submitIntent() {
      submitIntentCalls += 1;
      return Promise.resolve({ status: 'queued', ticket: 'unused' });
    },
  };

  const promise = submitRouteIntent(runtime, routeOpenIntent, { url: 42 });

  assert.equal(typeof promise.then, 'function');
  await assert.rejects(promise, /Route request row does not match schema/);
  assert.equal(submitIntentCalls, 0);
});
