/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['**/*.unit.cli-{test,spec}.?(c|m)[jt]s?(x)'],
        env: {
            NANGO_ENCRYPTION_KEY: 'RzV4ZGo5RlFKMm0wYWlXdDhxTFhwb3ZrUG5KNGg3TmU='
        },
        chaiConfig: {
            truncateThreshold: 10000
        },
        fileParallelism: false,
        isolate: false,
        pool: 'forks'
    }
});
