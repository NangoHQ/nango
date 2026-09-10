import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import type { Plugin, UserConfig } from 'vite';

// The CDN's enforced `script-src 'self'` (set in nango-infra) blocks an inline script, and it serves
// the root, where the recovery could never fire — so only base-path-capable builds get it.
const withBasePathRecovery = process.env['CONNECT_UI_BASE_PATH_RECOVERY'] === 'true';

const ENTRY_TAG = '<script type="module" crossorigin';

// The content-type check separates a slashless base URL from a slashless depth-1 route
// ("…/connect/integrations"), which already resolves correctly: an SPA fallback answers 200 for both.
const RECOVERY_SCRIPT = `<script>
            window.addEventListener(
                'error',
                function (event) {
                    var el = event.target;
                    if (!el || el.tagName !== 'SCRIPT' || !el.src || location.pathname.endsWith('/')) {
                        return;
                    }
                    var withSlash = location.pathname + '/';
                    fetch(new URL(el.getAttribute('src'), location.origin + withSlash), { method: 'HEAD' })
                        .then(function (res) {
                            if (res.ok && (res.headers.get('content-type') || '').indexOf('javascript') !== -1) {
                                location.replace(withSlash + location.search + location.hash);
                            }
                        })
                        .catch(function () {});
                },
                true
            );
        </script>`;

function injectBasePathRecovery(): Plugin {
    return {
        name: 'connect-ui:base-path-recovery',
        apply: 'build',
        transformIndexHtml: {
            order: 'post',
            handler: (html) => {
                if (!html.includes(ENTRY_TAG)) {
                    throw new Error(
                        `[connect-ui] base-path-recovery: entry script tag "${ENTRY_TAG}" not found in built index.html — Vite changed its output shape, update the marker`
                    );
                }
                // Before the entry tag, so the listener is registered when that script fails.
                return html.replace(ENTRY_TAG, `${RECOVERY_SCRIPT}\n      ${ENTRY_TAG}`);
            }
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
    // Relative base so the prebuilt bundle can be served under any path. Requires a trailing slash
    // on the document URL and depth-1 routes. Dev stays at root.
    base: command === 'build' ? './' : '/',
    plugins: [react(), svgr(), tailwindcss(), ...(withBasePathRecovery ? [injectBasePathRecovery()] : [])] as UserConfig['plugins'],
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
