import { createHash } from 'node:crypto';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import svgr from 'vite-plugin-svgr';

import type { Plugin, PluginOption, ProxyOptions } from 'vite';

const REMOTE_API_URLS: Record<string, string> = {
    dev: 'https://api-development.nango.dev',
    staging: 'https://api-staging.nango.dev',
    prod: 'https://api.nango.dev'
};

// Fetches /env.js from a remote API and rewrites apiUrl to the local dev server
// so all API calls are routed through Vite's proxy instead of going cross-origin.
// Activated by setting REMOTE_API=dev|staging|prod when running the dev server.
function remoteApiEnvProxy(remoteApiUrl: string): Plugin {
    return {
        name: 'remote-api-env-proxy',
        configureServer(server) {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            server.middlewares.use('/env.js', async (req, res) => {
                const origin = `http://${req.headers.host ?? 'localhost:3000'}`;
                const body = await fetch(`${remoteApiUrl}/env.js`).then((r) => r.text());
                res.setHeader('Content-Type', 'text/javascript');
                res.end(body.replace(/"apiUrl": "[^"]*"/, `"apiUrl": "${origin}"`));
            });
        }
    };
}

function remoteApiConfig(remoteApi: string | undefined) {
    if (!remoteApi) {
        return { remotePlugin: null, remoteProxy: { '/env.js': { target: 'http://localhost:3003' } } };
    }
    const url = REMOTE_API_URLS[remoteApi];
    if (!url) {
        throw new Error(`Unknown REMOTE_API="${remoteApi}". Valid values: ${Object.keys(REMOTE_API_URLS).join(', ')}`);
    }
    return { remotePlugin: remoteApiEnvProxy(url), remoteProxy: { '/api': { target: url, changeOrigin: true } } };
}

// https://vitejs.dev/config/
export default defineConfig(() => {
    const { remotePlugin, remoteProxy } = remoteApiConfig(process.env['REMOTE_API']);

    return {
        plugins: [react(), svgr(), checker({ typescript: true }), tailwindcss(), remotePlugin] as PluginOption[],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                // https://github.com/tabler/tabler-icons/issues/1233
                // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
                '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs'
            }
        },
        server: { proxy: remoteProxy },
        define: {
            'import.meta.env.VITE_HASH': JSON.stringify(createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 8))
        }
    };
});
