import * as z from 'zod';

// Disable Zod v4's JIT validator compilation, which uses `new Function` and trips
// the Connect UI's `script-src` CSP (report-only today). The non-JIT path is
// functionally identical, so this keeps `script-src 'self'` without `'unsafe-eval'`.
//
// This lives in its own module so main.tsx can import it *first* — ES modules
// evaluate all imports before the importing module's body, so any Zod schema
// created in the App tree must see jitless already set.
z.config({ jitless: true });
