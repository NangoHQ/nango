import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import type { Plugin, UserConfig } from 'vite';

// Vite drops extra attributes when it rewrites the entry <script> tag at build, so re-attach the
// onerror hook that drives the trailing-slash retry (see the inline script in index.html).
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
    // Build with a relative base so the prebuilt bundle is servable under any path with no rewrite
    // step. Correctness requires the document URL to end in '/' at the base root (guarded by the
    // inline script in index.html) and all routes staying depth-1 without trailing slashes — from a
    // deep-route document ('{base}/integrations'), relative assets resolve one level up, back to the
    // base. The dev server stays at root.
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
