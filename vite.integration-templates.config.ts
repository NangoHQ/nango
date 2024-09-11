/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['integration-templates/**/*.{test,spec}.?(c|m)[jt]s?(x)']
    }
});
