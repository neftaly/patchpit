export type OutputStream = 'stderr' | 'stdout';

export interface PatchpitDoc {
  readonly body: string;
  readonly kind: 'note';
  readonly title: string;
}

export type CapabilityGrant =
  | {
      readonly docId: string;
      readonly kind: 'read-doc' | 'write-doc';
      readonly namespace: string;
    }
  | {
      readonly kind: 'emit-output';
      readonly stream?: OutputStream;
    };

export type PatchpitHostRequest =
  | {
      readonly docId: string;
      readonly namespace: string;
      readonly type: 'read-doc';
    }
  | {
      readonly docId: string;
      readonly namespace: string;
      readonly type: 'write-doc';
      readonly value: unknown;
    }
  | {
      readonly chunk: string;
      readonly stream: OutputStream;
      readonly type: 'emit-output';
    };

export type HostDiagnosticCode = 'capability_denied' | 'output_dropped' | 'schema_rejected';

export interface HostDiagnostic {
  readonly action: PatchpitHostRequest['type'];
  readonly appId: string;
  readonly code: HostDiagnosticCode;
  readonly detail: string;
  readonly target: string;
}

export interface HostDecision {
  readonly action: PatchpitHostRequest['type'];
  readonly allowed: boolean;
  readonly appId: string;
  readonly reason: 'capability' | 'granted' | 'schema';
  readonly target: string;
}

export interface OutputRecord {
  readonly bytes: number;
  readonly repeatCount: number;
  readonly stream: OutputStream;
  readonly text: string;
}

export interface OutputStats {
  readonly droppedBytes: number;
  readonly droppedChunks: number;
}

export type HostResponse =
  | {
      readonly ok: true;
      readonly value?: unknown;
    }
  | {
      readonly diagnostic: HostDiagnostic;
      readonly ok: false;
      readonly reason: HostDiagnosticCode;
    };

export interface PatchpitMainThreadPort {
  marshal(request: PatchpitHostRequest): HostResponse;
}

interface FakePatchpitAppHostOptions {
  readonly docs?: readonly {
    readonly docId: string;
    readonly namespace: string;
    readonly value: PatchpitDoc;
  }[];
  readonly grants?: readonly CapabilityGrant[];
  readonly outputLimitBytes?: number;
  readonly outputLimitRecords?: number;
}

export class FakePatchpitAppHost {
  readonly decisions: HostDecision[] = [];
  readonly diagnostics: HostDiagnostic[] = [];

  private readonly docs = new Map<string, PatchpitDoc>();
  private readonly grants: readonly CapabilityGrant[];
  private readonly outputLimitBytes: number;
  private readonly outputLimitRecords: number;
  private readonly outputRecords: OutputRecord[] = [];
  private outputBytes = 0;
  private outputStatsValue: OutputStats = { droppedBytes: 0, droppedChunks: 0 };

  constructor(options: FakePatchpitAppHostOptions = {}) {
    this.grants = options.grants ?? [];
    this.outputLimitBytes = options.outputLimitBytes ?? 256;
    this.outputLimitRecords = options.outputLimitRecords ?? 8;

    for (const doc of options.docs ?? []) {
      this.docs.set(docKey(doc.namespace, doc.docId), cloneDoc(doc.value));
    }
  }

  mainThreadPort(appId: string): PatchpitMainThreadPort {
    return {
      marshal: (request) => this.marshal(appId, request)
    };
  }

  marshal(appId: string, request: PatchpitHostRequest): HostResponse {
    const target = requestTarget(request);

    if (!this.hasGrant(request)) {
      return this.deny(appId, request, target, 'capability_denied', 'capability');
    }

    if (request.type === 'read-doc') {
      this.allow(appId, request, target);

      return {
        ok: true,
        value: cloneOptionalDoc(this.docs.get(docKey(request.namespace, request.docId)))
      };
    }

    if (request.type === 'write-doc') {
      const parsed = parsePatchpitDoc(request.value);

      if (!parsed.ok) {
        return this.deny(appId, request, target, 'schema_rejected', 'schema', parsed.detail);
      }

      this.allow(appId, request, target);
      this.docs.set(docKey(request.namespace, request.docId), cloneDoc(parsed.value));

      return { ok: true };
    }

    this.allow(appId, request, target);
    this.appendOutput(appId, request, target);

    return { ok: true };
  }

  readDoc(namespace: string, docId: string): PatchpitDoc | undefined {
    return cloneOptionalDoc(this.docs.get(docKey(namespace, docId)));
  }

  output(): readonly OutputRecord[] {
    return this.outputRecords.map((record) => ({ ...record }));
  }

  outputStats(): OutputStats {
    return { ...this.outputStatsValue };
  }

  private appendOutput(appId: string, request: Extract<PatchpitHostRequest, { type: 'emit-output' }>, target: string) {
    const bytes = Buffer.byteLength(request.chunk, 'utf8');
    const last = this.outputRecords.at(-1);

    if (last?.stream === request.stream && last.text === request.chunk) {
      this.outputRecords[this.outputRecords.length - 1] = {
        ...last,
        repeatCount: last.repeatCount + 1
      };
      return;
    }

    if (this.outputRecords.length >= this.outputLimitRecords || this.outputBytes + bytes > this.outputLimitBytes) {
      this.outputStatsValue = {
        droppedBytes: this.outputStatsValue.droppedBytes + bytes,
        droppedChunks: this.outputStatsValue.droppedChunks + 1
      };
      this.diagnostics.push({
        action: request.type,
        appId,
        code: 'output_dropped',
        detail: `dropped output chunk ${this.outputStatsValue.droppedChunks}`,
        target
      });
      return;
    }

    this.outputBytes += bytes;
    this.outputRecords.push({
      bytes,
      repeatCount: 1,
      stream: request.stream,
      text: request.chunk
    });
  }

  private allow(appId: string, request: PatchpitHostRequest, target: string) {
    this.decisions.push({
      action: request.type,
      allowed: true,
      appId,
      reason: 'granted',
      target
    });
  }

  private deny(
    appId: string,
    request: PatchpitHostRequest,
    target: string,
    code: HostDiagnosticCode,
    reason: 'capability' | 'schema',
    detail: string = code
  ): HostResponse {
    const diagnostic: HostDiagnostic = {
      action: request.type,
      appId,
      code,
      detail,
      target
    };

    this.decisions.push({
      action: request.type,
      allowed: false,
      appId,
      reason,
      target
    });
    this.diagnostics.push(diagnostic);

    return {
      diagnostic,
      ok: false,
      reason: code
    };
  }

  private hasGrant(request: PatchpitHostRequest): boolean {
    return this.grants.some((grant) => {
      if (request.type === 'emit-output') {
        return grant.kind === 'emit-output' && (grant.stream === undefined || grant.stream === request.stream);
      }

      return grant.kind === request.type && grant.namespace === request.namespace && grant.docId === request.docId;
    });
  }
}

export const maliciousApps = {
  docSnooper: (port: PatchpitMainThreadPort): readonly HostResponse[] => [
    port.marshal({ docId: 'public-note', namespace: 'workspace-a', type: 'read-doc' }),
    port.marshal({ docId: 'private-note', namespace: 'workspace-a', type: 'read-doc' }),
    port.marshal({ docId: 'public-note', namespace: 'workspace-b', type: 'read-doc' })
  ],
  malformedWriter: (port: PatchpitMainThreadPort): HostResponse =>
    port.marshal({
      docId: 'public-note',
      namespace: 'workspace-a',
      type: 'write-doc',
      value: { body: 42, kind: 'note', title: 'invalid body should not persist' }
    }),
  spamOutput: (port: PatchpitMainThreadPort): void => {
    for (let index = 0; index < 5; index += 1) {
      port.marshal({ chunk: 'same-line\n', stream: 'stdout', type: 'emit-output' });
    }

    for (let index = 0; index < 12; index += 1) {
      port.marshal({ chunk: `spam-${index}\n`, stream: 'stdout', type: 'emit-output' });
    }
  }
} as const;

function cloneDoc(value: PatchpitDoc): PatchpitDoc {
  return { body: value.body, kind: value.kind, title: value.title };
}

function cloneOptionalDoc(value: PatchpitDoc | undefined): PatchpitDoc | undefined {
  return value === undefined ? undefined : cloneDoc(value);
}

function docKey(namespace: string, docId: string): string {
  return `${namespace}\0${docId}`;
}

function parsePatchpitDoc(value: unknown):
  | {
      readonly ok: true;
      readonly value: PatchpitDoc;
    }
  | {
      readonly detail: string;
      readonly ok: false;
    } {
  if (!isRecord(value)) {
    return { detail: 'doc value must be an object', ok: false };
  }

  if (value.kind !== 'note') {
    return { detail: 'doc kind must be note', ok: false };
  }

  if (typeof value.title !== 'string') {
    return { detail: 'doc title must be a string', ok: false };
  }

  if (typeof value.body !== 'string') {
    return { detail: 'doc body must be a string', ok: false };
  }

  return {
    ok: true,
    value: {
      body: value.body,
      kind: value.kind,
      title: value.title
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestTarget(request: PatchpitHostRequest): string {
  if (request.type === 'emit-output') {
    return request.stream;
  }

  return `${request.namespace}/${request.docId}`;
}
