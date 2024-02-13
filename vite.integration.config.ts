/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        include: ['**/*.integration.{test,spec}.?(c|m)[jt]s?(x)'],
        globalSetup: './tests/setup.ts',
        poolOptions: {
            singleThread: true
        },
        testTimeout: 20000
    }
});
