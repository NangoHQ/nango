/// <reference types="vitest" />
// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vite';

process.env = { ...process.env, TZ: 'UTC' };

export default defineConfig({
    test: {
        include: ['**/*.integration.{test,spec}.?(c|m)[jt]s?(x)'],
        globalSetup: './tests/setup.ts',
        setupFiles: './tests/setupFiles.ts',
        threads: false,
        testTimeout: 20000
    }
});
