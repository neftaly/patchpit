import { automergeMimeType, findNode, type FilesystemNode } from '@patchpit/system';

type PreviewResource = {
  readonly mediaType: string;
  readonly name: string;
  readonly sourceUrl: string | null;
  readonly text: string;
};

export function Viewer({
  filesystemRoot,
  url,
}: {
  readonly filesystemRoot: FilesystemNode;
  readonly url: string | undefined;
}) {
  if (url === undefined) {
    return <section className="surface-content" aria-label="window content" />;
  }

  const selectedNode = findNode(filesystemRoot, url);
  const resource = previewResource(selectedNode);
  const imageSourceUrl = imagePreviewSourceUrl(resource);
  return (
    <section className="surface-content" aria-label="window content">
      {imageSourceUrl !== null ? (
        <div className="file-preview url-preview">
          <img src={imageSourceUrl} alt={resource.name} />
        </div>
      ) : resource.sourceUrl !== null && !isTextPreviewResource(resource) ? (
        <div className="file-preview url-preview">
          <a href={resource.sourceUrl}>{resource.sourceUrl}</a>
        </div>
      ) : (
        <pre className="file-preview">{resource.text}</pre>
      )}
    </section>
  );
}

function previewResource(node: FilesystemNode | null): PreviewResource {
  if (node === null) return { mediaType: 'text/plain', name: 'Preview', sourceUrl: null, text: '' };
  if (node.kind === 'file') {
    return {
      mediaType: node.mediaType,
      name: node.name,
      sourceUrl: node.sourceUrl,
      text: node.text,
    };
  }
  return {
    mediaType: automergeMimeType,
    name: node.name,
    sourceUrl: null,
    text: node.text,
  };
}

function imagePreviewSourceUrl(resource: PreviewResource): string | null {
  const mediaType = normalizedMediaType(resource.mediaType);
  if (!mediaType.startsWith('image/')) return null;
  if (mediaType === 'image/svg+xml' && resource.text !== '') return textDataUrl(mediaType, resource.text);
  return isDisplayableImageUrl(resource.sourceUrl) ? resource.sourceUrl : null;
}

function textDataUrl(mediaType: string, text: string): string {
  return `data:${safeMediaType(mediaType)};charset=utf-8,${encodeDataUrlText(text)}`;
}

function safeMediaType(mediaType: string): string {
  return /^[a-z]+\/[a-z0-9.+-]+$/i.test(mediaType) ? mediaType : 'text/plain';
}

function encodeDataUrlText(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

function normalizedMediaType(mediaType: string): string {
  return mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function isTextPreviewResource(resource: PreviewResource): boolean {
  if (resource.text !== '') return true;
  const mediaType = normalizedMediaType(resource.mediaType);
  return mediaType.startsWith('text/')
    || mediaType === 'application/json'
    || mediaType === 'application/javascript'
    || mediaType === 'application/ecmascript'
    || mediaType === automergeMimeType
    || mediaType === 'application/xml'
    || mediaType.endsWith('+json')
    || mediaType.endsWith('+xml');
}

function isDisplayableImageUrl(sourceUrl: string | null): sourceUrl is string {
  return sourceUrl !== null && (sourceUrl.startsWith('data:') || sourceUrl.startsWith('https:'));
}
