import { playwright } from '@vitest/browser-playwright';
import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

// vite.config is a function of Vite's `command` — its base path differs between `build` (a
// placeholder) and `serve` (root). Call it with command: 'serve' to get a plain config object for
// mergeConfig (so we inherit plugins and aliases) and the root base, which is what tests want.
const resolvedViteConfig = viteConfig({ command: 'serve', mode: 'test' });

export default defineConfig({
    test: {
        projects: [
            mergeConfig(
                resolvedViteConfig,
                defineProject({
                    optimizeDeps: {
                        include: ['react/jsx-runtime']
                    },
                    test: {
                        name: 'browser',
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
            ),
            defineProject({
                test: {
                    name: 'node',
                    include: ['scripts/**/*.node.test.js'],
                    environment: 'node'
                }
            })
        ]
    }
});
