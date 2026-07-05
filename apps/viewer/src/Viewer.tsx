import { findNode, type FilesystemNode } from '@patchpit/system';

export function Viewer({
  filesystemRoot,
  liveDocuments,
  url,
}: {
  readonly filesystemRoot: FilesystemNode;
  readonly liveDocuments: Readonly<Record<string, unknown>>;
  readonly url: string | undefined;
}) {
  if (url === undefined) {
    return <section className="surface-content" aria-label="window content" />;
  }

  const node = findNode(filesystemRoot, url);
  const liveDocument = liveDocuments[url];
  return (
    <section className="surface-content" aria-label="window content">
      {liveDocument !== undefined ? (
        <pre className="file-preview">{JSON.stringify(liveDocument, null, 2)}</pre>
      ) : node?.kind === 'folder' ? (
        <pre className="file-preview">{node.text}</pre>
      ) : node?.sourceUrl && node.mediaType.startsWith('image/') ? (
        <div className="file-preview url-preview">
          <img src={node.sourceUrl} alt={node.name} />
        </div>
      ) : node?.sourceUrl ? (
        <div className="file-preview url-preview">
          <a href={node.sourceUrl}>{node.sourceUrl}</a>
        </div>
      ) : (
        <pre className="file-preview">{node?.text ?? ''}</pre>
      )}
    </section>
  );
}
