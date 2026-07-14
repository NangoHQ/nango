import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import { BASE_PATH_PLACEHOLDER } from './scripts/base-path.js';

import type { UserConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
    // Build under a placeholder base so the bundle can be served from a non-root path without
    // rebuilding: the container entrypoint rewrites it at startup (see scripts/set-base-path.js).
    // The dev server stays at root.
    base: command === 'build' ? BASE_PATH_PLACEHOLDER : '/',
    plugins: [react(), svgr(), tailwindcss()] as UserConfig['plugins'],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    // Put each language file in its own chunk
                    if (id.includes('i18n/translations/')) {
                        const lang = id.split('/').pop()?.split('.')[0];
                        return `lang-${lang}`;
                    }
                }
            }
        }
    }
}));
