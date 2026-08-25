import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['scripts/**/*.unit.test.mjs']
    }
});
