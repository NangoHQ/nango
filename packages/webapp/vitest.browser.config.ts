import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    optimizeDeps: { include: ['react/jsx-runtime'] },
    test: {
        attachmentsDir: '../../.context/oauth-browser-attachments',
        include: ['src/**/*.browser.test.tsx'],
        setupFiles: ['./src/test/browserSetup.ts'],
        browser: {
            enabled: true,
            headless: true,
            screenshotDirectory: '../../.context/oauth-browser-tests',
            provider: playwright(),
            instances: [{ browser: 'chromium' }]
        }
    }
});
