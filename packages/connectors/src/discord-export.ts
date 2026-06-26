import {
  connectorEventId,
  finishIngest,
  stableKey,
  summarizeBody,
  type ConnectorDiagnostic,
  type ConnectorEvent,
  type ConnectorIngestResult
} from './connector-event.js';
import { parseCsvRecords, type CsvRecord } from './csv.js';

export type DiscordExportOptions = {
  readonly accountHint?: string;
  readonly channelId?: string;
  readonly channelName?: string;
  readonly sourcePath?: string;
};

export function parseDiscordMessagesCsv(input: string, options: DiscordExportOptions = {}): ConnectorIngestResult {
  const diagnostics: ConnectorDiagnostic[] = [];
  const records = parseCsvRecords(input);
  const events = records.flatMap((record) => parseDiscordRecord(record, options, diagnostics));

  return finishIngest('discord-data-package', input, events, diagnostics);
}

function parseDiscordRecord(
  record: CsvRecord,
  options: DiscordExportOptions,
  diagnostics: ConnectorDiagnostic[]
): readonly ConnectorEvent[] {
  const messageId = firstValue(record, ['id', 'message_id']);
  const timestamp = firstValue(record, ['timestamp', 'date', 'sent_at']);
  const contents = firstValue(record, ['contents', 'content', 'message']);
  const attachments = firstValue(record, ['attachments', 'attachment']);

  if (messageId === undefined || messageId.trim() === '') {
    diagnostics.push({
      code: 'missing_id',
      message: 'Discord export row has no message id.',
      row: record.row,
      source: 'discord-data-package'
    });
    return [];
  }

  if (timestamp === undefined || timestamp.trim() === '') {
    diagnostics.push({
      code: 'missing_timestamp',
      message: 'Discord export row has no timestamp.',
      row: record.row,
      source: 'discord-data-package'
    });
    return [];
  }

  const sentAt = toIsoDate(timestamp);
  if (sentAt === undefined) {
    diagnostics.push({
      code: 'invalid_date',
      message: 'Discord export row timestamp is not a valid date.',
      row: record.row,
      source: 'discord-data-package'
    });
    return [];
  }

  const summary = summarizeBody(contents);
  const conversationKey = stableKey(options.channelId ?? options.channelName);

  return [withoutUndefined({
    ...summary,
    accountKey: stableKey(options.accountHint),
    attachmentCount: countAttachments(attachments),
    conversationKey,
    id: connectorEventId(['discord', options.channelId ?? '', messageId]),
    kind: 'discord',
    labels: options.channelName === undefined ? [] : [`channel:${options.channelName}`],
    recipientKeys: [],
    sentAt,
    source: 'discord-data-package',
    sourcePath: options.sourcePath
  })];
}

function firstValue(record: CsvRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record.values.get(key);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function countAttachments(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return 0;
  }

  return value.split(/\s+/).filter((part) => part.trim() !== '').length;
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
