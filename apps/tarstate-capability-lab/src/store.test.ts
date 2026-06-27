import { describe, expect, it } from 'vitest';
import { as, from, pipe, project } from '../../../packages/tarstate/src/index';
import { demoRows } from './demoData';
import { capabilityLabSchema } from './schema';
import { createCapabilityLabStore } from './store';

const resource = as(capabilityLabSchema.resources, 'resource');

describe('capability lab store lens', () => {
  it('keeps raw mutable state private while snapshots stay queryable', async () => {
    const { store, controller } = createCapabilityLabStore(demoRows);
    const notifications: string[] = [];
    const unsubscribe = store.subscribe(() => {
      notifications.push('changed');
    });

    controller.updateResourceStatus('res-socket-feed', 'active');
    unsubscribe();
    controller.updateResourceStatus('res-socket-feed', 'closed');

    const rows = await store.query(pipe(from(resource), project({
      resourceId: resource.resourceId,
      status: resource.status
    })));

    expect(notifications).toEqual(['changed']);
    expect(Object.hasOwn(store.getState(), 'clock')).toBe(false);
    expect(Object.hasOwn(store.getState(), 'nextIntentSequence')).toBe(false);
    expect(rows.rows.find((row) => row.resourceId === 'res-socket-feed')).toEqual({
      resourceId: 'res-socket-feed',
      status: 'closed'
    });
  });
});
