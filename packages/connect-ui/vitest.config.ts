import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

// vite.config exports a config function (its base path depends on build vs serve); resolve it for
// the test run so we still inherit its plugins and aliases. Tests run at the root base.
const resolvedViteConfig = viteConfig({ command: 'serve', mode: 'test' });

export default mergeConfig(
    resolvedViteConfig,
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
