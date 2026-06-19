import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

// Browser Mode (real Chromium via Playwright) is required so Tailwind CSS and theme
// tokens actually apply — that's what lets axe-core evaluate color contrast, and what
// makes real focus/keyboard events fire. jsdom can't do either.
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
