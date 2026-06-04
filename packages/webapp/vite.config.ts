import { createHash } from 'node:crypto';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import svgr from 'vite-plugin-svgr';

import type { Plugin } from 'vite';

const DEV_PORT = 3000;
const LOCAL_API_PORT = 3003;

const REMOTE_API_URLS: Record<string, string> = {
    dev: 'https://api-development.nango.dev',
    staging: 'https://api-staging.nango.dev',
    prod: 'https://api.nango.dev'
};

// Fetches /env.js from apiUrl and rewrites apiUrl to the local Vite dev server
// so all API calls are routed through Vite's proxy instead of going cross-origin.
// The actual listening port is resolved at request time (after the server binds)
// so Vite's automatic port increment is reflected correctly.
function apiEnvProxyPlugin(apiUrl: string): Plugin {
    return {
        name: 'api-env-proxy',
        configureServer(server) {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            server.middlewares.use('/env.js', async (_req, res) => {
                const addr = server.httpServer?.address();
                const port = addr && typeof addr === 'object' ? addr.port : DEV_PORT;
                const origin = `http://localhost:${port}`;
                const body = await fetch(`${apiUrl}/env.js`).then((r) => r.text());
                res.setHeader('Content-Type', 'text/javascript');
                res.end(body.replace(/"apiUrl": "[^"]*"/, `"apiUrl": "${origin}"`));
            });
        }
    };
}

function apiProxyConfig() {
    const remoteApi = process.env['REMOTE_API'];
    const remoteUrl = remoteApi ? REMOTE_API_URLS[remoteApi] : null;
    if (remoteApi && !remoteUrl) {
        throw new Error(`[nango] Unknown REMOTE_API="${remoteApi}". Valid values: ${Object.keys(REMOTE_API_URLS).join(', ')}`);
    }

    const apiUrl = remoteUrl ?? `http://localhost:${LOCAL_API_PORT}`;
    const proxyOpts = remoteUrl ? { target: apiUrl, changeOrigin: true } : { target: apiUrl };
    return {
        envProxyPlugin: apiEnvProxyPlugin(apiUrl),
        proxy: {
            '/api': proxyOpts,
            // Extra routes needed for connection creation and auth flows.
            // Most dashboard functionality (viewing connections, logs, settings) works with /api alone.
            '/connect': proxyOpts, // Connect UI session + telemetry
            '/integrations': proxyOpts, // Connect UI integration list
            '/providers': proxyOpts, // Connect UI provider details
            '/proxy': proxyOpts, // Getting-started proxy call
            '/oauth2': proxyOpts, // OAuth2 client credentials
            '/api-auth': proxyOpts, // API key / basic auth
            '/auth': proxyOpts, // TBA, JWT, two-step, etc.
            '/app-store-auth': proxyOpts,
            '/app-auth': proxyOpts // GitHub App setup callback
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig(() => {
    const { envProxyPlugin, proxy } = apiProxyConfig();

    return {
        plugins: [react(), svgr(), checker({ typescript: true }), tailwindcss(), envProxyPlugin],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
                // https://github.com/tabler/tabler-icons/issues/1233
                // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
                '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs'
            }
        },
        server: { port: DEV_PORT, proxy },
        define: {
            'import.meta.env.VITE_HASH': JSON.stringify(createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 8))
        }
    };
});
