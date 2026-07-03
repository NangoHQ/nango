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
