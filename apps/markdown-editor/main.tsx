import { install } from '@neftaly/editcontext-polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownEditorExperiment } from './MarkdownEditorExperiment.tsx';
import './editor.css';

const forcedPolyfill = new URL(location.href).searchParams.has('force-polyfill');
if (forcedPolyfill) install({ force: true });
document.documentElement.dataset.experimentMode = forcedPolyfill ? 'forced-polyfill' : 'default';

const root = document.querySelector('#root');
if (root === null) throw new Error('Markdown editor root is unavailable');
createRoot(root).render(
  <StrictMode>
    <MarkdownEditorExperiment />
  </StrictMode>,
);
