import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import type { Plugin, UserConfig } from 'vite';

// Only a deployment that can sit under a base path needs the recovery below, and only its own host
// decides whether an inline script may run. The CDN build stays inline-free: it serves the root, so
// the recovery could never fire there, and the enforced `script-src 'self'` (set in nango-infra)
// would block it anyway.
const withBasePathRecovery = process.env['CONNECT_UI_BASE_PATH_RECOVERY'] === 'true';

const ENTRY_TAG = '<script type="module" crossorigin';

// A slashless base URL ("…/nango/connect") resolves the relatively-referenced bundle one directory
// too high. Confirming the trailing-slash form serves real JavaScript is what separates that from a
// slashless depth-1 route ("…/nango/connect/integrations"), which already resolves correctly and
// must not be redirected: an SPA fallback answers 200 with `index.html` for both.
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

function noInlineScripts(): Plugin {
    return {
        name: 'connect-ui:no-inline-scripts',
        apply: 'build',
        transformIndexHtml: {
            order: 'post',
            handler: (html) => {
                // Blank out quoted values, preserving length so indexes still map onto `html`: text
                // inside an attribute value must not pass for an attribute itself.
                const tagsOnly = html.replace(/"[^"]*"|'[^']*'/g, (quoted) => ' '.repeat(quoted.length));
                const blocked = /<script\b(?![^>]*\ssrc\s*=)[^>]*>/i.exec(tagsOnly) ?? /<[^>]+\son[a-z]+/i.exec(tagsOnly);
                if (blocked) {
                    const snippet = html.slice(blocked.index, blocked.index + 80).trim();
                    throw new Error(`[connect-ui] no-inline-scripts: "${snippet}" is blocked by the enforced CSP`);
                }
                return html;
            }
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
    // Relative base so the prebuilt bundle can be served under any path. Requires a trailing slash
    // on the document URL and depth-1 routes. Dev stays at root.
    base: command === 'build' ? './' : '/',
    plugins: [react(), svgr(), tailwindcss(), withBasePathRecovery ? injectBasePathRecovery() : noInlineScripts()] as UserConfig['plugins'],
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
