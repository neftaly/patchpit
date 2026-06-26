import { describe, expect, it } from 'vitest';
import { FakePatchpitAppHost, maliciousApps, type CapabilityGrant } from './fixtures/malicious-app-host';

const publicDoc = {
  body: 'shared',
  kind: 'note',
  title: 'Public'
} as const;

const privateDoc = {
  body: 'secret',
  kind: 'note',
  title: 'Private'
} as const;

const docs = [
  { docId: 'public-note', namespace: 'workspace-a', value: publicDoc },
  { docId: 'private-note', namespace: 'workspace-a', value: privateDoc },
  { docId: 'public-note', namespace: 'workspace-b', value: { body: 'other workspace', kind: 'note', title: 'Other' } }
] as const;

const readPublicGrant: CapabilityGrant = {
  docId: 'public-note',
  kind: 'read-doc',
  namespace: 'workspace-a'
};

const writePublicGrant: CapabilityGrant = {
  docId: 'public-note',
  kind: 'write-doc',
  namespace: 'workspace-a'
};

describe('malicious app capability harness', () => {
  it('doc-snooper is denied ungranted paths and diagnostics record the denial', () => {
    const host = new FakePatchpitAppHost({
      docs,
      grants: [readPublicGrant]
    });

    const responses = maliciousApps.docSnooper(host.mainThreadPort('doc-snooper'));

    expect(responses).toMatchObject([{ ok: true, value: publicDoc }, { ok: false }, { ok: false }]);
    expect(host.diagnostics).toMatchObject([
      {
        action: 'read-doc',
        appId: 'doc-snooper',
        code: 'capability_denied',
        target: 'workspace-a/private-note'
      },
      {
        action: 'read-doc',
        appId: 'doc-snooper',
        code: 'capability_denied',
        target: 'workspace-b/public-note'
      }
    ]);
    expect(host.decisions.map(({ allowed, target }) => ({ allowed, target }))).toEqual([
      { allowed: true, target: 'workspace-a/public-note' },
      { allowed: false, target: 'workspace-a/private-note' },
      { allowed: false, target: 'workspace-b/public-note' }
    ]);
  });

  it('malformed-writer is schema-rejected before mutating state', () => {
    const host = new FakePatchpitAppHost({
      docs,
      grants: [writePublicGrant]
    });

    const response = maliciousApps.malformedWriter(host.mainThreadPort('malformed-writer'));

    expect(response).toMatchObject({
      diagnostic: {
        action: 'write-doc',
        appId: 'malformed-writer',
        code: 'schema_rejected',
        target: 'workspace-a/public-note'
      },
      ok: false,
      reason: 'schema_rejected'
    });
    expect(host.readDoc('workspace-a', 'public-note')).toEqual(publicDoc);
    expect(host.decisions).toMatchObject([
      {
        action: 'write-doc',
        allowed: false,
        reason: 'schema',
        target: 'workspace-a/public-note'
      }
    ]);
  });

  it('malformed-writer without write capability is denied before schema details leak', () => {
    const host = new FakePatchpitAppHost({
      docs,
      grants: [readPublicGrant]
    });

    const response = maliciousApps.malformedWriter(host.mainThreadPort('malformed-writer'));

    expect(response).toMatchObject({
      diagnostic: {
        code: 'capability_denied',
        target: 'workspace-a/public-note'
      },
      ok: false,
      reason: 'capability_denied'
    });
    expect(host.readDoc('workspace-a', 'public-note')).toEqual(publicDoc);
  });

  it('spam-output is coalesced, bounded, and reports dropped output', () => {
    const host = new FakePatchpitAppHost({
      grants: [{ kind: 'emit-output', stream: 'stdout' }],
      outputLimitBytes: 64,
      outputLimitRecords: 4
    });

    maliciousApps.spamOutput(host.mainThreadPort('spam-output'));

    expect(host.output()).toEqual([
      { bytes: 10, repeatCount: 5, stream: 'stdout', text: 'same-line\n' },
      { bytes: 7, repeatCount: 1, stream: 'stdout', text: 'spam-0\n' },
      { bytes: 7, repeatCount: 1, stream: 'stdout', text: 'spam-1\n' },
      { bytes: 7, repeatCount: 1, stream: 'stdout', text: 'spam-2\n' }
    ]);
    expect(host.outputStats()).toEqual({ droppedBytes: 65, droppedChunks: 9 });
    expect(host.diagnostics.some((diagnostic) => diagnostic.code === 'output_dropped')).toBe(true);
  });

  it('documents harness scope instead of claiming real browser or cryptographic containment', () => {
    const host = new FakePatchpitAppHost({
      docs,
      grants: [readPublicGrant, writePublicGrant, { kind: 'emit-output' }]
    });

    const ambientSurface = ['read-doc:any', 'write-doc:any', 'emit-output:any', 'browser-api:any'];
    const capabilitySurface = [
      ...host.decisions,
      readPublicGrant,
      writePublicGrant,
      { kind: 'emit-output' as const }
    ].filter((entry) => 'kind' in entry);

    expect(capabilitySurface).toHaveLength(3);
    expect(capabilitySurface.length).toBeLessThan(ambientSurface.length);
  });
});
