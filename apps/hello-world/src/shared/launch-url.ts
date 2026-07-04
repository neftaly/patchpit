export function launchUrl(path: string, src: string): string {
  return `${path}#${JSON.stringify({ src })}`;
}

export function launchSrc(url: string, path: string): string | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1 || url.slice(0, hashIndex) !== path) return null;

  try {
    const args: unknown = JSON.parse(url.slice(hashIndex + 1));
    return typeof args === 'object' && args !== null && 'src' in args && typeof args.src === 'string'
      ? args.src
      : null;
  } catch {
    return null;
  }
}
