// import { StrictMode } from 'react';
// Must be imported first: disables Zod's JIT (new Function) before any schema in
// the App tree is created, so the Connect UI's `script-src` CSP isn't tripped.
import './lib/zod-config';

import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';

import './index.css';

createRoot(document.getElementById('root') as HTMLElement).render(
    // <StrictMode>
    <App />
    // </StrictMode>
);
