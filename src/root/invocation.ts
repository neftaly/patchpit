export const DEFAULT_ROOT_SYNC = ['wss://sync.automerge.org'] as const;

export type RootInvocation = {
  readonly src?: string;
  readonly sync: readonly [string, ...string[]];
  readonly delegation?: string;
};

type RootInvocationResult =
  | { readonly ok: true; readonly value: RootInvocation }
  | { readonly ok: false; readonly error: 'decode' | 'json' | 'object' | 'unknown' | 'src' | 'sync' | 'delegation' };

export const parseRootInvocationHash = (
  hash: string,
  isAutomergeUrl: (value: string) => boolean,
): RootInvocationResult => {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const parsed = parseInvocationJson(raw);
  if (!parsed.ok) return parsed;
  const candidate = parsed.value;
  if (!isRecord(candidate)) return { ok: false, error: 'object' };
  if (Object.keys(candidate).some((key) => !['src', 'sync', 'delegation'].includes(key))) {
    return { ok: false, error: 'unknown' };
  }
  if (candidate.src !== undefined
    && (typeof candidate.src !== 'string' || !isAutomergeUrl(candidate.src))) {
    return { ok: false, error: 'src' };
  }
  if (candidate.sync !== undefined
    && (!Array.isArray(candidate.sync) || candidate.sync.length === 0
      || !candidate.sync.every((value) => typeof value === 'string'))) {
    return { ok: false, error: 'sync' };
  }
  if (Object.hasOwn(candidate, 'delegation') && typeof candidate.delegation !== 'string') {
    return { ok: false, error: 'delegation' };
  }

  return {
    ok: true,
    value: {
      ...(candidate.src === undefined ? {} : { src: candidate.src }),
      sync: candidate.sync === undefined ? DEFAULT_ROOT_SYNC : candidate.sync as [string, ...string[]],
      ...(typeof candidate.delegation === 'string' ? { delegation: candidate.delegation } : {}),
    },
  };
};

export const canonicalRootInvocationHash = (invocation: RootInvocation) =>
  `#${JSON.stringify(invocation)}`;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseInvocationJson = (raw: string):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: 'decode' | 'json' } => {
  if (raw === '') return { ok: true, value: {} };
  const direct = parseJson(raw);
  if (direct.ok) return direct;
  try {
    return parseJson(decodeURIComponent(raw));
  } catch {
    return { ok: false, error: 'decode' };
  }
};

const parseJson = (input: string):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: 'json' } => {
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch {
    return { ok: false, error: 'json' };
  }
};
