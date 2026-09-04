import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

import type { Plugin, UserConfig } from 'vite';

// The CDN serves this artifact under an enforced `script-src 'self'` (set in nango-infra), so an inline script would never run.
function noInlineScripts(): Plugin {
    return {
        name: 'connect-ui:no-inline-scripts',
        apply: 'build',
        transformIndexHtml: {
            order: 'post',
            handler: (html) => {
                // Quoted values are dropped first, so ` src=` inside an attribute can't pass for the attribute itself.
                const tagsOnly = html.replace(/"[^"]*"|'[^']*'/g, '');
                const inlineScript = (tagsOnly.match(/<script\b[^>]*>/gi) ?? []).find((tag) => !/\ssrc\s*=/i.test(tag));
                const blocked = inlineScript ?? /<[^>]+\son[a-z]+\s*=/i.exec(tagsOnly)?.[0];
                if (blocked) {
                    throw new Error(`[connect-ui] no-inline-scripts: "${blocked}" is blocked by the enforced CSP`);
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
    plugins: [react(), svgr(), tailwindcss(), noInlineScripts()] as UserConfig['plugins'],
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
