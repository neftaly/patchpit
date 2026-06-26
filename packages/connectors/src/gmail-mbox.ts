import {
  connectorEventId,
  finishIngest,
  stableKey,
  stableKeys,
  summarizeBody,
  type ConnectorDiagnostic,
  type ConnectorEvent,
  type ConnectorIngestResult
} from './connector-event.js';

export type GmailMboxOptions = {
  readonly accountHint?: string;
  readonly sourcePath?: string;
};

type ParsedMessage = {
  readonly index: number;
  readonly headers: ReadonlyMap<string, readonly string[]>;
  readonly body: string;
};

export function parseGmailMbox(input: string, options: GmailMboxOptions = {}): ConnectorIngestResult {
  const diagnostics: ConnectorDiagnostic[] = [];
  const messages = splitMbox(input)
    .map((chunk, index) => parseMessage(chunk, index + 1))
    .filter((message): message is ParsedMessage => message !== undefined);
  const events = messages.flatMap((message) => parseGmailMessage(message, options, diagnostics));

  return finishIngest('gmail-mbox', input, events, diagnostics);
}

function parseGmailMessage(
  message: ParsedMessage,
  options: GmailMboxOptions,
  diagnostics: ConnectorDiagnostic[]
): readonly ConnectorEvent[] {
  const messageId = firstHeader(message.headers, 'message-id') ?? `missing-id-${message.index}`;
  const date = firstHeader(message.headers, 'date');
  const subject = firstHeader(message.headers, 'subject');
  const from = firstHeader(message.headers, 'from');
  const to = allHeaders(message.headers, ['to', 'cc', 'bcc']).flatMap(splitAddressList);
  const labels = firstHeader(message.headers, 'x-gmail-labels')?.split(',').map((label) => label.trim()).filter((label) => label !== '') ?? [];

  if (date === undefined) {
    diagnostics.push({
      code: 'missing_timestamp',
      message: 'Gmail mbox message has no Date header.',
      row: message.index,
      source: 'gmail-mbox'
    });
    return [];
  }

  const sentAt = toIsoDate(date);
  if (sentAt === undefined) {
    diagnostics.push({
      code: 'invalid_date',
      message: 'Gmail mbox Date header is not a valid date.',
      row: message.index,
      source: 'gmail-mbox'
    });
    return [];
  }

  const summary = summarizeBody(message.body);

  return [withoutUndefined({
    ...summary,
    accountKey: stableKey(options.accountHint),
    attachmentCount: attachmentCount(message),
    conversationKey: stableKey(subject),
    id: connectorEventId(['gmail', messageId]),
    kind: 'gmail',
    labels,
    recipientKeys: stableKeys(to),
    senderKey: stableKey(from),
    sentAt,
    source: 'gmail-mbox',
    sourcePath: options.sourcePath
  })];
}

function splitMbox(input: string): readonly string[] {
  const lines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('From ') && current.length > 0) {
      chunks.push(current.join('\n'));
      current = [];
      continue;
    }

    if (line.startsWith('From ') && current.length === 0) {
      continue;
    }

    current.push(line);
  }

  if (current.some((line) => line.trim() !== '')) {
    chunks.push(current.join('\n'));
  }

  return chunks;
}

function parseMessage(chunk: string, index: number): ParsedMessage | undefined {
  const lines = chunk.split('\n');
  const separatorIndex = lines.findIndex((line) => line.trim() === '');

  if (separatorIndex < 0) {
    return undefined;
  }

  return {
    body: lines.slice(separatorIndex + 1).join('\n'),
    headers: parseHeaders(lines.slice(0, separatorIndex)),
    index
  };
}

function parseHeaders(lines: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const headers = new Map<string, string[]>();
  let activeHeader: string | undefined;

  for (const line of lines) {
    if (/^[\t ]/.test(line) && activeHeader !== undefined) {
      const values = headers.get(activeHeader);
      const previous = values?.pop() ?? '';
      values?.push(`${previous} ${line.trim()}`);
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      activeHeader = undefined;
      continue;
    }

    activeHeader = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    const values = headers.get(activeHeader) ?? [];
    values.push(value);
    headers.set(activeHeader, values);
  }

  return headers;
}

function firstHeader(headers: ReadonlyMap<string, readonly string[]>, key: string): string | undefined {
  return headers.get(key)?.[0];
}

function allHeaders(headers: ReadonlyMap<string, readonly string[]>, keys: readonly string[]): readonly string[] {
  return keys.flatMap((key) => headers.get(key) ?? []);
}

function splitAddressList(value: string): readonly string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function attachmentCount(message: ParsedMessage): number {
  const bodyAttachmentHints = [...message.body.matchAll(/content-disposition:\s*attachment/gi)].length;
  const headerAttachmentHints = [...allHeaders(message.headers, ['content-type']).join('\n').matchAll(/name=/gi)].length;

  return bodyAttachmentHints + headerAttachmentHints;
}

function toIsoDate(value: string): string | undefined {
  const date = new Date(value);

  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): ConnectorEvent {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, Exclude<unknown, undefined>] => entry[1] !== undefined)
  ) as ConnectorEvent;
}
