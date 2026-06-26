export type ViewerArgs = {
  readonly assetUrl?: string;
  readonly path?: string;
  readonly title?: string;
};

export function parseViewerHash(hash: string): ViewerArgs {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;

  if (raw.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? pickArgs(parsed) : {};
  } catch {
    return { title: 'Invalid args' };
  }
}

function pickArgs(input: Record<string, unknown>): ViewerArgs {
  return {
    ...(typeof input.assetUrl === 'string' ? { assetUrl: input.assetUrl } : {}),
    ...(typeof input.path === 'string' ? { path: input.path } : {}),
    ...(typeof input.title === 'string' ? { title: input.title } : {})
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
