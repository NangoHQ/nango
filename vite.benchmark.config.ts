/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';

process.env.TZ = 'UTC';

export default defineConfig({
    test: {
        include: ['**/*.benchmark.test.?(c|m)[jt]s?(x)'],
        globalSetup: './tests/setup.ts',
        setupFiles: './tests/setupFiles.ts',
        testTimeout: 60000,
        env: {
            NANGO_ENCRYPTION_KEY: 'RzV4ZGo5RlFKMm0wYWlXdDhxTFhwb3ZrUG5KNGg3TmU=',
            NANGO_LOGS_ENABLED: 'true',
            NANGO_LOGS_ES_PREFIX: 'test',
            ORCHESTRATOR_SERVICE_URL: 'http://orchestrator',
            RUNNER_NODE_ID: '1',
            ORCHESTRATOR_TASK_CREATED_PER_GROUP_COUNT_MAX: '4294967296'
        },
        fileParallelism: false,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true
            }
        }
    }
});
