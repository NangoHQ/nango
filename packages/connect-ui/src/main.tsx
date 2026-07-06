// import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as z from 'zod';

import { App } from './App.tsx';

import './index.css';

// Disable Zod v4's JIT validator compilation, which uses `new Function` and trips
// the Connect UI's `script-src` CSP (report-only today). The non-JIT path is
// functionally identical, so this keeps `script-src 'self'` without `'unsafe-eval'`.
z.config({ jitless: true });

createRoot(document.getElementById('root') as HTMLElement).render(
    // <StrictMode>
    <App />
    // </StrictMode>
);
