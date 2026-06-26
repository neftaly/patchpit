export type ViewerArgs = {
  readonly error?: string;
  readonly src?: string;
  readonly title?: string;
};

export function parseViewerHash(hash: string): ViewerArgs {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;

  if (raw.length === 0) {
    return {};
  }

  const parsed = parseJsonRecord(raw) ?? parseJsonRecord(raw.replaceAll('%22', '"'));

  if (parsed !== undefined) {
    return pickArgs(parsed);
  }

  return { error: 'Invalid args' };
}

function parseJsonRecord(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function pickArgs(input: Record<string, unknown>): ViewerArgs {
  return {
    ...(typeof input.src === 'string' ? { src: input.src } : {}),
    ...(typeof input.title === 'string' ? { title: input.title } : {})
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
