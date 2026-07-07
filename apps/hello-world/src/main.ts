import { createSandboxDocument, type SandboxDocumentFile } from '@patchpit/sandbox';
import relativeSvg from './relative-poc.svg?raw';

const files: readonly SandboxDocumentFile[] = [
  {
    contentType: 'text/html',
    path: 'index.html',
    text: '<p id="status">html loaded</p><img src="./relative-poc.svg"><img src="./ghostscript-tiger.svg"><script type="module" src="./main.js"></script>',
  },
  {
    contentType: 'text/javascript',
    path: 'main.js',
    text: `
const status = document.querySelector('#status');
let loaded = 0;
for (const image of document.images) {
  image.addEventListener('load', () => {
    loaded += 1;
    if (status) status.textContent = \`js loaded, images \${loaded}/\${document.images.length}\`;
    if (loaded === document.images.length) parent.postMessage({ type: 'hello-world:ready' }, '*');
  });
  image.addEventListener('error', () => parent.postMessage({ type: 'hello-world:error', src: image.getAttribute('src') }, '*'));
}
if (status) status.textContent = 'js loaded';
`,
  },
  { contentType: 'image/svg+xml', path: 'relative-poc.svg', text: relativeSvg },
  {
    contentType: 'image/svg+xml',
    path: 'ghostscript-tiger.svg',
    text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 48"><text x="60" y="28" text-anchor="middle">ghostscript tiger</text></svg>',
  },
];

const app = document.querySelector('#app');
if (app === null) throw new Error('Missing app root.');

const status = document.createElement('p');
const iframe = document.createElement('iframe');
iframe.style.cssText = 'display:block;width:100%;height:180px;border:1px solid #bbb;';
status.textContent = 'mounting';
app.replaceChildren(status, iframe);

window.addEventListener('message', (event) => {
  if (event.source !== iframe.contentWindow) return;
  if (event.data?.type === 'hello-world:ready') status.textContent = 'hello world loaded';
  if (event.data?.type === 'hello-world:error') status.textContent = `asset failed: ${String(event.data.src)}`;
});

const sandboxDocument = await createSandboxDocument({ entry: 'index.html', files });
iframe.src = sandboxDocument.url;
window.addEventListener('pagehide', () => sandboxDocument.dispose(), { once: true });
