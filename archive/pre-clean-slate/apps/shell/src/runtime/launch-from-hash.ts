type InvalidHashLaunchConfig = {
  readonly status: 'invalid';
  readonly message: string;
  readonly details: readonly string[];
};

export type HashLaunchConfig =
  | { readonly status: 'empty' }
  | InvalidHashLaunchConfig
  | { readonly status: 'ready'; readonly src: string };

type DecodedHashFragment =
  | InvalidHashLaunchConfig
  | { readonly status: 'ok'; readonly value: string };

export function parseHashLaunchConfig(hash: string): HashLaunchConfig {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (fragment === '') return { status: 'empty' };

  const decoded = decodeHashFragment(fragment);
  if (decoded.status === 'invalid') return decoded;

  const trimmed = decoded.value.trim();
  if (!trimmed.startsWith('{')) {
    return invalidHashLaunchConfig(
      'Hash launch config must be a JSON object.',
      'Only JSON object hash config is supported.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return invalidHashLaunchConfig(
      'Hash launch config is malformed JSON.',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!isRecord(parsed)) {
    return invalidHashLaunchConfig(
      'Hash launch config must be a JSON object.',
      'Parsed hash config was not an object.',
    );
  }

  const src = parsed.src;
  if (typeof src !== 'string' || src.trim() === '') {
    return invalidHashLaunchConfig(
      'Hash launch config requires a string src.',
      'Expected {"src":"automerge:..."} or {"src":"/path/in/filesystem"}.',
    );
  }

  return { status: 'ready', src: src.trim() };
}

function decodeHashFragment(fragment: string): DecodedHashFragment {
  try {
    return { status: 'ok', value: decodeURIComponent(fragment) };
  } catch (error) {
    return invalidHashLaunchConfig(
      'Hash launch config could not be decoded.',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function invalidHashLaunchConfig(message: string, detail: string): InvalidHashLaunchConfig {
  return {
    status: 'invalid',
    message,
    details: ['source: location.hash', detail],
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
