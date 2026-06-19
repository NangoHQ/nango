/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultExclude, defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        // Unit tests should exercise workspace source, not potentially stale dist/
        // artifacts restored by CI incremental build caches.
        alias: {
            '@nangohq/nango-yaml': path.resolve(rootDir, 'packages/nango-yaml/lib/index.ts')
        }
    },
    test: {
        include: ['**/*.unit.{test,spec}.?(c|m)[jt]s?(x)'],
        // Vitest 4 dropped dist/** from its defaultExclude, so compiled test files
        // built into packages/*/dist get collected and run as duplicates. Re-add it.
        exclude: [...defaultExclude, '**/dist/**'],
        setupFiles: './tests/setupFiles.ts',
        env: {
            NANGO_ENCRYPTION_KEY: 'RzV4ZGo5RlFKMm0wYWlXdDhxTFhwb3ZrUG5KNGg3TmU=',
            NANGO_LOGS_ES_URL: 'http://fake.com',
            NANGO_LOGS_ES_USER: '',
            NANGO_LOGS_ES_PWD: '',
            NANGO_LOGS_ENABLED: 'false',
            NANGO_DB_NAME: 'nango_test',
            RUNNER_NODE_ID: '1'
        },
        chaiConfig: {
            truncateThreshold: 10000
        }
    },
    server: {
        headers: {
            'Cross-Origin-Embedder-Policy': 'unsafe-none'
        }
    }
});
