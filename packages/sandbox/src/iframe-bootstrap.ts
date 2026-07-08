export type SandboxBootstrapPayload = {
  readonly contentSecurityPolicy: string;
  readonly entryHtml: string;
  readonly entryPath: string;
  readonly fileDataUrls: readonly (readonly [string, string])[];
  readonly htmlFiles: readonly (readonly [string, string])[];
};

export const sandboxContentSecurityPolicy = [
  `default-src 'none'`,
  `base-uri 'none'`,
  `connect-src 'none'`,
  `font-src data:`,
  `form-action 'none'`,
  `frame-src data:`,
  `img-src data:`,
  `media-src data:`,
  `object-src 'none'`,
  `script-src 'unsafe-inline' data:`,
  `style-src 'unsafe-inline' data:`,
  `worker-src 'none'`,
].join('; ');

export const sandboxIframeBootstrapHtml = (payload: SandboxBootstrapPayload): string => `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(payload.contentSecurityPolicy)}">
<script>
(${runSandboxIframeBootstrap.toString()})(${JSON.stringify(payload).replaceAll('<', '\\u003c')});
</script>`;

function runSandboxIframeBootstrap(payload: SandboxBootstrapPayload) {
  const fileDataUrls = new Map(payload.fileDataUrls);
  const htmlFiles = new Map(payload.htmlFiles);
  const entryUrl = new URL(payload.entryPath, 'https://sandbox.local/');
  const nativeFetch = window.fetch.bind(window);
  const NativeRequest = window.Request;
  const urlAttributes = ['src', 'href'];
  const urlSelector = '[src], [href]';

  const isRelativeFileReference = (value: string) => {
    const trimmed = value.trim();
    return trimmed !== ''
      && !trimmed.startsWith('#')
      && !trimmed.startsWith('/')
      && !trimmed.startsWith('\\')
      && !URL.canParse(trimmed);
  };

  const fileDataUrl = (value: string | null) => {
    if (value === null || !isRelativeFileReference(value)) return value;
    const resolved = fileDataUrls.get(relativeFilePath(value));
    if (resolved === undefined) throw new Error(`Missing sandbox file referenced from ${payload.entryPath}: ${value}`);
    return `${resolved}${new URL(value.trim(), entryUrl).hash}`;
  };

  const relativeFilePath = (value: string) =>
    new URL(value.trim(), entryUrl).pathname.slice(1);

  const bootstrapHtml = (entryPath: string, entryHtml: string) => `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="${payload.contentSecurityPolicy.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">
<script>
(${runSandboxIframeBootstrap.toString()})(${JSON.stringify({ ...payload, entryHtml, entryPath }).replaceAll('<', '\\u003c')});
</scr${'ipt'}>`;

  const iframeSrcdoc = (element: Element, value: string | null) => {
    if (!(element instanceof HTMLIFrameElement) || value === null || !isRelativeFileReference(value)) return false;
    const path = relativeFilePath(value);
    const html = htmlFiles.get(path);
    if (html === undefined) return false;
    element.srcdoc = bootstrapHtml(path, html);
    element.removeAttribute('src');
    return true;
  };

  window.Request = class SandboxRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const resolved = typeof input === 'string' || input instanceof URL ? fileDataUrl(input.toString()) : null;
      super(resolved ?? input, init);
    }
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const resolved = typeof input === 'string' || input instanceof URL
      ? fileDataUrl(input.toString())
      : input instanceof Request
        ? fileDataUrl(input.url)
        : null;
    if (resolved === null) return nativeFetch(input, init);
    return resolved.startsWith('data:')
      ? Promise.resolve(dataUrlResponse(resolved))
      : nativeFetch(input instanceof Request ? new Request(resolved, input) : resolved, init);
  };

  const rewriteRelativeUrlAttributes = (root: ParentNode) => {
    const elements = root instanceof Element && root.matches(urlSelector)
      ? [root, ...root.querySelectorAll(urlSelector)]
      : root.querySelectorAll(urlSelector);
    for (const element of elements) {
      for (const name of urlAttributes) {
        const value = element.getAttribute(name);
        if (name === 'src' && iframeSrcdoc(element, value)) continue;
        const resolved = fileDataUrl(value);
        if (resolved !== null && resolved !== value) element.setAttribute(name, resolved);
      }
    }
  };

  const parsedEntryDocument = new DOMParser().parseFromString(payload.entryHtml, 'text/html');
  rewriteRelativeUrlAttributes(parsedEntryDocument);
  document.documentElement.replaceWith(document.importNode(parsedEntryDocument.documentElement, true));

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) rewriteRelativeUrlAttributes(mutation.target);
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) rewriteRelativeUrlAttributes(node);
      }
    }
  }).observe(document, { attributeFilter: ['href', 'src'], attributes: true, childList: true, subtree: true });

  const activateEntryScripts = async () => {
    for (const inertScript of Array.from(document.scripts)) {
      const script = document.createElement('script');
      for (const attribute of inertScript.attributes) script.setAttribute(attribute.name, attribute.value);
      script.async = false;
      script.text = inertScript.text;
      if (script.src.startsWith('data:')) {
        script.text = dataUrlText(script.src);
        script.removeAttribute('src');
      }
      if (script.src === '') {
        inertScript.replaceWith(script);
        continue;
      }
      await new Promise<void>((resolve, reject) => {
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => reject(new Error(`Failed to load sandbox script: ${script.src}`)), { once: true });
        inertScript.replaceWith(script);
      });
    }
  };

  void activateEntryScripts().catch((error) => setTimeout(() => { throw error; }));

  function dataUrlBytes(url: string) {
    const commaIndex = url.indexOf(',');
    if (commaIndex === -1) throw new Error(`Invalid sandbox data URL: ${url}`);
    const metadata = url.slice(0, commaIndex);
    const body = url.slice(commaIndex + 1);
    return {
      bytes: metadata.endsWith(';base64')
        ? Uint8Array.from(atob(body), (character) => character.charCodeAt(0))
        : new TextEncoder().encode(decodeURIComponent(body)),
      contentType: metadata.slice('data:'.length).replace(';base64', ''),
    };
  }

  function dataUrlResponse(url: string) {
    const { bytes, contentType } = dataUrlBytes(url);
    return new Response(bytes, { headers: { 'Content-Type': contentType } });
  }

  function dataUrlText(url: string) {
    return new TextDecoder().decode(dataUrlBytes(url).bytes);
  }
}

const escapeHtmlAttribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
