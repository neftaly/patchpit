import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Expected #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    🦕
  </StrictMode>
);
