export type InfinigenArgs = {
  readonly delegation?: string;
  readonly doc?: string;
  readonly error?: string;
  readonly preset?: InfinigenPreset;
  readonly quality?: InfinigenQuality;
  readonly seed?: string;
  readonly speech?: InfinigenSpeechMode;
  readonly sync?: readonly string[];
};

export type InfinigenPreset = 'linz-nz';
export type InfinigenQuality = 'balanced' | 'high' | 'ultra';
export type InfinigenSpeechMode = 'browser' | 'local';

export function parseInfinigenHash(hash: string): InfinigenArgs {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;

  if (raw.length === 0) {
    return {};
  }

  const jsonRaw = jsonWrapperValue(raw) ?? raw;
  const parsed =
    parseJsonRecord(jsonRaw) ??
    parseJsonRecord(jsonRaw.replaceAll('%22', '"')) ??
    parseJsonRecord(decodeHashValue(jsonRaw));

  if (parsed !== undefined) {
    return pickArgs(parsed);
  }

  const params = new URLSearchParams(raw);
  const delegation = params.get('delegation');
  const doc = params.get('doc');
  const preset = params.get('preset');
  const quality = params.get('quality');
  const seed = params.get('seed');
  const speech = params.get('speech');
  const sync = params.getAll('sync');
  const args = pickArgs({
    ...(delegation === null ? {} : { delegation }),
    ...(doc === null ? {} : { doc }),
    ...(preset === null ? {} : { preset }),
    ...(quality === null ? {} : { quality }),
    ...(seed === null ? {} : { seed }),
    ...(speech === null ? {} : { speech }),
    ...(sync.length === 0 ? {} : { sync })
  });

  return args.delegation === undefined &&
    args.doc === undefined &&
    args.preset === undefined &&
    args.quality === undefined &&
    args.seed === undefined &&
    args.speech === undefined &&
    args.sync === undefined
    ? { error: 'Invalid Infinigen args' }
    : args;
}

export function infinigenStreamUrl(baseHref: string, args: InfinigenArgs): string {
  const url = new URL('api/infinigen/scene.ndjson', baseHref);

  if (args.quality !== undefined) {
    url.searchParams.set('quality', args.quality);
  }

  if (args.preset !== undefined) {
    url.searchParams.set('preset', args.preset);
  }

  if (args.seed !== undefined) {
    url.searchParams.set('seed', args.seed);
  }

  return url.href;
}

function jsonWrapperValue(raw: string): string | undefined {
  if (!raw.startsWith('JSON(') || !raw.endsWith(')')) {
    return undefined;
  }

  return raw.slice(5, -1);
}

function parseJsonRecord(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function decodeHashValue(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function pickArgs(input: Record<string, unknown>): InfinigenArgs {
  const delegation = boundedString(input.delegation, 512);
  const seed = boundedString(input.seed, 96);
  const doc = boundedString(input.doc, 512);
  const preset = presetValue(input.preset);
  const quality = qualityValue(input.quality);
  const speech = speechModeValue(input.speech);
  const sync = syncValues(input.sync);
  return {
    ...(delegation === undefined ? {} : { delegation }),
    ...(doc === undefined ? {} : { doc }),
    ...(preset === undefined ? {} : { preset }),
    ...(quality === undefined ? {} : { quality }),
    ...(seed === undefined ? {} : { seed }),
    ...(speech === undefined ? {} : { speech }),
    ...(sync === undefined ? {} : { sync })
  };
}

function presetValue(value: unknown): InfinigenPreset | undefined {
  return value === 'linz-nz' ? value : undefined;
}

function qualityValue(value: unknown): InfinigenQuality | undefined {
  return value === 'balanced' || value === 'high' || value === 'ultra' ? value : undefined;
}

function speechModeValue(value: unknown): InfinigenSpeechMode | undefined {
  return value === 'browser' || value === 'local' ? value : undefined;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined;
}

function syncValues(value: unknown): readonly string[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const sync = raw
    .map((item) => boundedString(item, 1024))
    .filter((item): item is string => item !== undefined)
    .slice(0, 8);

  return sync.length === 0 ? undefined : sync;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
