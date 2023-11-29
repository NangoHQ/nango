/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        include: ['**/*.integration.{test,spec}.?(c|m)[jt]s?(x)'],
        globalSetup: './tests/setup.ts',
        threads: false,
        testTimeout: 20000
    }
});
