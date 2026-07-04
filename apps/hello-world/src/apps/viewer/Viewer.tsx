import type { WindowTab } from '../../filesystem';
import type { FilesystemNode } from '../../filesystem-tree';
import { findNode, folderSummary } from '../../filesystem-tree';
import { launchSrc } from '../../shared/launch-url';

export function Viewer({
  filesystemRoot,
  liveDocuments,
  tab,
}: {
  readonly filesystemRoot: FilesystemNode;
  readonly liveDocuments: Readonly<Record<string, string>>;
  readonly tab: WindowTab | null;
}) {
  if (tab === null) {
    return <section className="viewer" aria-label="window content" />;
  }

  const src = launchSrc(tab.targetUrl, 'viewer.html');
  const node = src === null ? null : findNode(filesystemRoot, src);
  const liveText = src === null ? undefined : liveDocuments[src];
  return (
    <section className="viewer" aria-label="window content">
      {liveText !== undefined ? (
        <pre className="file-preview">{liveText}</pre>
      ) : node?.kind === 'folder' ? (
        <pre className="file-preview">{JSON.stringify(folderSummary(node), null, 2)}</pre>
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
