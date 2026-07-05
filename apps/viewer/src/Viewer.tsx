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

  const selectedNode = findNode(filesystemRoot, url);
  const liveDocument = liveDocuments[url];
  return (
    <section className="surface-content" aria-label="window content">
      {liveDocument !== undefined ? (
        <pre className="file-preview">{JSON.stringify(liveDocument, null, 2)}</pre>
      ) : selectedNode?.kind === 'folder' ? (
        <pre className="file-preview">{selectedNode.text}</pre>
      ) : selectedNode?.sourceUrl && selectedNode.mediaType.startsWith('image/') ? (
        <div className="file-preview url-preview">
          <img src={selectedNode.sourceUrl} alt={selectedNode.name} />
        </div>
      ) : selectedNode?.sourceUrl ? (
        <div className="file-preview url-preview">
          <a href={selectedNode.sourceUrl}>{selectedNode.sourceUrl}</a>
        </div>
      ) : (
        <pre className="file-preview">{selectedNode?.text ?? ''}</pre>
      )}
    </section>
  );
}
