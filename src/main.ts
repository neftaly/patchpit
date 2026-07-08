import { createInitialSandboxMount } from './initial-sandbox-mount';

const root = document.querySelector('#root');
if (root === null) throw new Error('Missing root element.');

root.textContent = 'Loading sandbox...';

try {
  const sandboxDocument = createInitialSandboxMount().document;
  const iframe = document.createElement('iframe');
  iframe.height = '320';
  iframe.referrerPolicy = sandboxDocument.referrerPolicy;
  iframe.setAttribute('sandbox', sandboxDocument.sandbox);
  iframe.src = sandboxDocument.url;
  iframe.title = 'Sandbox';
  iframe.width = '320';
  root.replaceChildren(iframe);
} catch (error) {
  root.textContent = error instanceof Error ? error.message : String(error);
}
