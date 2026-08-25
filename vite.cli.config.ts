/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['**/*.unit.cli-{test,spec}.?(c|m)[jt]s?(x)'],
        // Vitest 4 dropped dist/** from its defaultExclude, so compiled test files
        // built into packages/*/dist get collected and run as duplicates. Re-add it.
        exclude: [...defaultExclude, '**/dist/**'],
        env: {
            NANGO_ENCRYPTION_KEY: 'RzV4ZGo5RlFKMm0wYWlXdDhxTFhwb3ZrUG5KNGg3TmU='
        },
        testTimeout: 20000,
        chaiConfig: {
            truncateThreshold: 10000
        },
        fileParallelism: false,
        pool: 'forks'
    }
});
