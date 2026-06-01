import { createHash } from 'node:crypto';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import svgr from 'vite-plugin-svgr';

import type { Plugin, PluginOption } from 'vite';

const STAGING_API = 'https://api-staging.nango.dev';

// Fetches /env.js from staging and rewrites apiUrl to the local dev server so
// all API calls are routed through Vite's proxy instead of going cross-origin.
function stagingEnvProxy(): Plugin {
    return {
        name: 'staging-env-proxy',
        configureServer(server) {
            server.middlewares.use('/env.js', async (req, res) => {
                const origin = `http://${req.headers.host ?? 'localhost:3000'}`;
                const body = await fetch(`${STAGING_API}/env.js`).then((r) => r.text());
                res.setHeader('Content-Type', 'text/javascript');
                res.end(body.replace(/"apiUrl": "[^"]*"/, `"apiUrl": "${origin}"`));
            });
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        svgr(),
        checker({
            typescript: true
        }),
        tailwindcss(),
        stagingEnvProxy()
    ] as PluginOption[],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // https://github.com/tabler/tabler-icons/issues/1233
            // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
            '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs'
        }
    },
    server: {
        proxy: {
            '/api': { target: STAGING_API, changeOrigin: true }
        }
    },
    define: {
        'import.meta.env.VITE_HASH': JSON.stringify(createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 8))
    }
});
