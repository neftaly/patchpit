import { describe, expect, it } from 'vitest';
import {
  as,
  anchoredPath,
  composeSources,
  defineSchema,
  evaluate,
  from,
  fromObjectSource,
  id,
  leftJoin,
  maybe,
  optional,
  pipe,
  project,
  ref,
  relation,
  string,
  eq,
  type RelationSource,
  type TarstateDiagnostic
} from '../packages/tarstate/src/index';

const schema = defineSchema({
  objects: relation<{
    id: string;
    kind: string;
    title: string;
  }>({
    key: 'id',
    fields: {
      id: id('object'),
      kind: string(),
      title: string()
    }
  }),
  presence: relation<{
    workspaceId: string;
    peerId: string;
    clientId: string;
    targetObjectId?: string;
    focusPath?: readonly unknown[];
  }>({
    ephemeral: true,
    key: ['workspaceId', 'peerId', 'clientId'],
    fields: {
      workspaceId: id('workspace'),
      peerId: id('peer'),
      clientId: string(),
      targetObjectId: optional(ref('objects.id')),
      focusPath: optional(anchoredPath())
    }
  })
});

const object = as(schema.objects, 'object');
const presence = as(schema.presence, 'presence');

const focusedObjects = pipe(
  from(object),
  leftJoin(from(presence), eq(object.id, presence.targetObjectId)),
  project({
    id: object.id,
    title: object.title,
    focusedBy: maybe(presence.peerId)
  })
);

describe('tarstate sources', () => {
  it('composes durable rows, ephemeral presence rows, and visibility diagnostics', async () => {
    const unreadableDiagnostic: TarstateDiagnostic = {
      code: 'unreadable_ref',
      message: 'linked Automerge document is unreadable',
      relation: 'objects',
      key: 'document:secret'
    };
    const visibilitySource: RelationSource = {
      rows: () => [],
      diagnostics: () => [unreadableDiagnostic]
    };

    const result = await evaluate(
      composeSources(
        fromObjectSource({
          objects: [{ id: 'object-a', kind: 'file', title: 'Alpha' }]
        }),
        fromObjectSource({
          presence: [
            {
              workspaceId: 'workspace-a',
              peerId: 'peer-a',
              clientId: 'client-a',
              targetObjectId: 'object-a',
              focusPath: ['object-a']
            }
          ]
        }),
        visibilitySource
      ),
      focusedObjects
    );

    expect(result.rows).toEqual([{ id: 'object-a', title: 'Alpha', focusedBy: 'peer-a' }]);
    expect(result.diagnostics).toEqual([unreadableDiagnostic]);
  });
});
