import { install } from '@neftaly/editcontext-polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { createEditorClient } from './editor-client.ts';
import './editor.css';

const forcedPolyfill = new URL(location.href).searchParams.has('force-polyfill');
if (forcedPolyfill) install({ force: true });
document.documentElement.dataset.inputMode = forcedPolyfill ? 'forced-polyfill' : 'default';

const root = document.querySelector('#root');
if (root === null) throw new Error('Markdown editor root is unavailable');
const client = createEditorClient();
createRoot(root).render(
  <StrictMode>
    <MarkdownEditor client={client} />
  </StrictMode>,
);
