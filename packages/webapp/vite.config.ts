import { createHash } from 'node:crypto';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import svgr from 'vite-plugin-svgr';

import type { Plugin } from 'vite';

const DEV_PORT = 3000;

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
                const origin = `http://${req.headers.host ?? `localhost:${DEV_PORT}`}`;
                const body = await fetch(`${remoteApiUrl}/env.js`).then((r) => r.text());
                res.setHeader('Content-Type', 'text/javascript');
                res.end(body.replace(/"apiUrl": "[^"]*"/, `"apiUrl": "${origin}"`));
            });
        }
    };
}

function remoteApiConfig() {
    const remoteApi = process.env['REMOTE_API'];
    if (!remoteApi) {
        return { remoteProxy: { '/env.js': { target: 'http://localhost:3003' } } };
    }
    const url = REMOTE_API_URLS[remoteApi];
    if (!url) {
        throw new Error(`[nango] Unknown REMOTE_API="${remoteApi}". Valid values: ${Object.keys(REMOTE_API_URLS).join(', ')}`);
    }
    const remote = { target: url, changeOrigin: true };
    return {
        remotePlugin: remoteApiEnvProxy(url),
        remoteProxy: { '/api': remote, '/oauth': remote, '/oauth2': remote, '/api-auth': remote, '/auth': remote }
    };
}

// https://vitejs.dev/config/
export default defineConfig(() => {
    const { remotePlugin, remoteProxy } = remoteApiConfig();

    return {
        plugins: [react(), svgr(), checker({ typescript: true }), tailwindcss(), remotePlugin],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                // https://github.com/tabler/tabler-icons/issues/1233
                // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
                '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs'
            }
        },
        server: { port: DEV_PORT, proxy: remoteProxy },
        define: {
            'import.meta.env.VITE_HASH': JSON.stringify(createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 8))
        }
    };
});
