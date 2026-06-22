import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            include: ['src/**/*.test.tsx'],
            setupFiles: ['./src/test/setup.ts'],
            browser: {
                enabled: true,
                headless: true,
                provider: playwright(),
                instances: [{ browser: 'chromium' }],
                // Don't dump PNGs into the source tree on failure; the assertion + DOM snapshot are enough.
                screenshotFailures: false
            }
        }
    })
);
