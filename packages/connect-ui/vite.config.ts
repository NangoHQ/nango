import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import type { Plugin, UserConfig } from 'vite';

// Vite drops extra attributes when rewriting the entry script tag; re-attach the retry hook (see index.html).
function basePathRetry(): Plugin {
    return {
        name: 'connect-ui:base-path-retry',
        apply: 'build',
        transformIndexHtml: {
            order: 'post',
            handler: (html) => html.replace('<script type="module" crossorigin', '<script type="module" crossorigin onerror="__nangoBasePathRetry()"')
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
    // Relative base so the prebuilt bundle can be served under any path. Requires a trailing slash
    // on the document URL (retried via index.html) and depth-1 routes. Dev stays at root.
    base: command === 'build' ? './' : '/',
    plugins: [react(), svgr(), tailwindcss(), basePathRetry()] as UserConfig['plugins'],
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
