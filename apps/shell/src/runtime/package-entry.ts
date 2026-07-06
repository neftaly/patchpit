export function resolvePackageEntry<T>(
  packageRoot: T,
  entry: string,
  child: (node: T, name: string) => T | undefined,
): T | undefined {
  const parts = entry.split('/').filter((part) => part !== '' && part !== '.');
  let node: T | undefined = packageRoot;
  for (const part of parts) {
    if (node === undefined) return undefined;
    node = child(node, part);
  }
  return node;
}
