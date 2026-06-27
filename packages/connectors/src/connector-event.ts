export type ConnectorKind = 'discord' | 'gmail';

export type ConnectorImportSource = 'discord-data-package' | 'gmail-mbox';

export type ConnectorDiagnosticCode =
  | 'invalid_date'
  | 'missing_body'
  | 'missing_header'
  | 'missing_id'
  | 'missing_timestamp'
  | 'row_parse_error';

export type ConnectorDiagnostic = {
  readonly code: ConnectorDiagnosticCode;
  readonly message: string;
  readonly source: ConnectorImportSource;
  readonly row?: number;
};

export type ConnectorEvent = {
  readonly id: string;
  readonly source: ConnectorImportSource;
  readonly kind: ConnectorKind;
  readonly sourcePath?: string;
  readonly accountKey?: string;
  readonly conversationKey?: string;
  readonly senderKey?: string;
  readonly recipientKeys: readonly string[];
  readonly sentAt: string;
  readonly bodyBytes: number;
  readonly bodyLines: number;
  readonly linkCount: number;
  readonly attachmentCount: number;
  readonly labels: readonly string[];
};

export type ConnectorIngestMetrics = {
  readonly acceptedEvents: number;
  readonly attachmentCount: number;
  readonly inputBytes: number;
  readonly privateBodyBytes: number;
  readonly rejectedRecords: number;
};

export type ConnectorIngestResult = {
  readonly events: readonly ConnectorEvent[];
  readonly diagnostics: readonly ConnectorDiagnostic[];
  readonly metrics: ConnectorIngestMetrics;
};

export function connectorEventId(parts: readonly string[]): string {
  return stableFingerprint(parts.join('\u001f'));
}

export function summarizeBody(value: string | undefined): {
  readonly bodyBytes: number;
  readonly bodyLines: number;
  readonly linkCount: number;
} {
  const body = value ?? '';

  return {
    bodyBytes: byteLength(body),
    bodyLines: body.length === 0 ? 0 : body.split(/\r\n|\r|\n/).length,
    linkCount: [...body.matchAll(/\bhttps?:\/\/[^\s<>"')]+/gi)].length
  };
}

export function stableKey(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();

  return normalized === undefined || normalized === '' ? undefined : stableFingerprint(normalized);
}

export function stableKeys(values: readonly string[]): readonly string[] {
  return values
    .map((value) => stableKey(value))
    .filter((value): value is string => value !== undefined);
}

export function finishIngest(
  source: ConnectorImportSource,
  input: string,
  events: readonly ConnectorEvent[],
  diagnostics: readonly ConnectorDiagnostic[]
): ConnectorIngestResult {
  return {
    diagnostics,
    events,
    metrics: {
      acceptedEvents: events.length,
      attachmentCount: events.reduce((total, event) => total + event.attachmentCount, 0),
      inputBytes: byteLength(input),
      privateBodyBytes: events.reduce((total, event) => total + event.bodyBytes, 0),
      rejectedRecords: diagnostics.filter((diagnostic) => diagnostic.source === source).length
    }
  };
}

export function containsSampleLeak(value: unknown, samples: readonly string[]): boolean {
  const serialized = JSON.stringify(value).toLowerCase();

  return samples
    .map((sample) => sample.trim().toLowerCase())
    .filter((sample) => sample.length >= 4)
    .some((sample) => serialized.includes(sample));
}

function stableFingerprint(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fp_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
