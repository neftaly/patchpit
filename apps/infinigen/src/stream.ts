import { parseInfinigenStreamEvent, type InfinigenStreamEvent } from './protocol';

export type InfinigenStreamHandlers = {
  readonly bytes?: (bytesPerSecond: number) => void;
  readonly close: () => void;
  readonly error: (error: unknown) => void;
  readonly event: (event: InfinigenStreamEvent) => void;
};

export function connectInfinigenStream(url: string, handlers: InfinigenStreamHandlers): AbortController {
  const abortController = new AbortController();

  void readNdjsonStream(url, abortController.signal, handlers).catch((error: unknown) => {
    if (!abortController.signal.aborted) {
      handlers.error(error);
    }
  });

  return abortController;
}

async function readNdjsonStream(
  url: string,
  signal: AbortSignal,
  handlers: InfinigenStreamHandlers
): Promise<void> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'application/x-ndjson' },
    signal
  });

  if (!response.ok) {
    throw new Error(`Infinigen stream failed: ${response.status}`);
  }

  if (response.body === null) {
    throw new Error('Infinigen stream response has no body');
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let bytesSinceSample = 0;
  let buffer = '';
  let sampledAt = performance.now();

  while (!signal.aborted) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    bytesSinceSample += result.value.byteLength;
    const now = performance.now();
    if (now - sampledAt >= 500) {
      handlers.bytes?.((bytesSinceSample * 1000) / (now - sampledAt));
      bytesSinceSample = 0;
      sampledAt = now;
    }

    buffer += decoder.decode(result.value, { stream: true });
    buffer = readCompleteLines(buffer, handlers);
  }

  buffer += decoder.decode();
  readCompleteLines(`${buffer}\n`, handlers);
  handlers.bytes?.(0);
  handlers.close();
}

function readCompleteLines(buffer: string, handlers: InfinigenStreamHandlers): string {
  let cursor = 0;

  for (;;) {
    const lineEnd = buffer.indexOf('\n', cursor);

    if (lineEnd === -1) {
      return buffer.slice(cursor);
    }

    const line = buffer.slice(cursor, lineEnd).trim();
    cursor = lineEnd + 1;

    if (line.length > 0) {
      handlers.event(parseInfinigenStreamEvent(JSON.parse(line) as unknown));
    }
  }
}
