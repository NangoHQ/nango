import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
    // Resolve the vite config function with 'serve' so tests get the root base, not the relative build base.
    viteConfig({ command: 'serve', mode: 'test' }),
    defineConfig({
        // SWC injects the `react/jsx-runtime` import at transform time, so Vite's esbuild dep
        // scanner never sees it and discovers it mid-run — re-optimizing and reloading the page,
        // which kills whichever test file is importing at that moment. Not fixable by a
        // plugin/Vite version bump: this is the maintainer-endorsed workaround for a known,
        // by-design scanner gap (https://github.com/vitejs/vite/issues/19343).
        optimizeDeps: { include: ['react/jsx-runtime'] },
        test: {
            include: ['src/**/*.test.tsx'],
            setupFiles: ['./src/test/setup.ts'],
            browser: {
                // Required: browser mode is off by default and the `test` script runs `vitest run`
                // without the --browser flag, so the suite would otherwise run in Node.
                enabled: true,
                headless: true,
                provider: playwright(),
                instances: [{ browser: 'chromium' }]
            }
        }
    })
);
