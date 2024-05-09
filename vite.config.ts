/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['**/*.unit.{test,spec}.?(c|m)[jt]s?(x)'],
        env: {
            NANGO_ENCRYPTION_KEY: 'RzV4ZGo5RlFKMm0wYWlXdDhxTFhwb3ZrUG5KNGg3TmU=',
            NANGO_LOGS_OS_URL: 'http://fake.com',
            NANGO_LOGS_OS_USER: '',
            NANGO_LOGS_OS_PWD: '',
            NANGO_LOGS_ENABLED: 'false'
        }
    }
});
