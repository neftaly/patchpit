export type OpaqueSandboxPayload = {
  readonly entry: string;
  readonly files: readonly (readonly [string, string])[];
  readonly html: string;
};

const sandboxCsp = [
  `default-src 'none'`,
  `base-uri 'none'`,
  `connect-src data:`,
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

export const opaqueBootstrap = (payload: OpaqueSandboxPayload): string => `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(sandboxCsp)}">
<script>
(${bootstrapRuntime.toString()})(${JSON.stringify(payload).replaceAll('<', '\\u003c')});
</script>`;

function bootstrapRuntime(payload: OpaqueSandboxPayload) {
  const files = new Map(payload.files);
  const base = new URL(payload.entry, 'https://sandbox.local/');
  const nativeFetch = window.fetch.bind(window);
  const urlAttributes = ['src', 'href'];
  const urlSelector = '[src], [href]';
  const absoluteUrlPattern = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

  const isRelativeFileReference = (value: string) => {
    const trimmed = value.trim();
    return trimmed !== ''
      && !trimmed.startsWith('#')
      && !trimmed.startsWith('/')
      && !trimmed.startsWith('\\')
      && !absoluteUrlPattern.test(trimmed);
  };

  const fileUrl = (value: string | null) => {
    if (value === null || !isRelativeFileReference(value)) return value;
    const url = new URL(value.trim(), base);
    const resolved = files.get(url.pathname.slice(1));
    if (resolved === undefined) throw new Error(`Missing sandbox file referenced from ${payload.entry}: ${value}`);
    return `${resolved}${url.hash}`;
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const resolved = typeof input === 'string' || input instanceof URL ? fileUrl(input.toString()) : null;
    return nativeFetch(resolved ?? input, init);
  };

  const rewrite = (root: ParentNode) => {
    const elements = root instanceof Element && root.matches(urlSelector)
      ? [root, ...root.querySelectorAll(urlSelector)]
      : root.querySelectorAll(urlSelector);
    for (const element of elements) {
      for (const name of urlAttributes) {
        const value = element.getAttribute(name);
        const resolved = fileUrl(value);
        if (resolved !== null && resolved !== value) element.setAttribute(name, resolved);
      }
    }
  };

  const parsed = new DOMParser().parseFromString(payload.html, 'text/html');
  rewrite(parsed);
  document.documentElement.replaceWith(document.importNode(parsed.documentElement, true));

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) rewrite(mutation.target);
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) rewrite(node);
      }
    }
  }).observe(document, { attributeFilter: ['href', 'src'], attributes: true, childList: true, subtree: true });

  const activateScripts = async () => {
    for (const inertScript of Array.from(document.scripts)) {
      const script = document.createElement('script');
      for (const attribute of inertScript.attributes) script.setAttribute(attribute.name, attribute.value);
      script.async = false;
      script.text = inertScript.text;
      if (script.src.startsWith('data:')) {
        script.text = await (await fetch(script.src)).text();
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

  void activateScripts().catch((error) => setTimeout(() => { throw error; }));
}

const escapeHtmlAttribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
