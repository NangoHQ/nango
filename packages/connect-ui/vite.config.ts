import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import type { UserConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
    // Relative base: built assets are referenced relative to the document URL, so the same prebuilt
    // bundle is servable under any path with no rewrite step. This requires the document URL to end
    // in '/' (guarded in index.html) and hash routing so the document never leaves the base root
    // (see src/lib/routes.ts). The dev server stays at root.
    base: command === 'build' ? './' : '/',
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
