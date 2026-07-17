import { execSync } from 'node:child_process';
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

// REMOTE_API mode only: fetch /env.js from the remote API and rewrite apiUrl to the local
// Vite origin, so API calls route through Vite's proxy instead of cross-origin to a backend
// whose CORS we don't control. Port is read at request time (after bind) to track Vite's
// automatic port increment.
function apiEnvProxyPlugin(apiUrl: string): Plugin {
    return {
        name: 'api-env-proxy',
        configureServer(server) {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            server.middlewares.use('/env.js', async (_req, res) => {
                const addr = server.httpServer?.address();
                const port = addr && typeof addr === 'object' ? addr.port : DEV_PORT;
                const origin = `http://localhost:${port}`;
                try {
                    const body = await fetch(`${apiUrl}/env.js`).then((r) => r.text());
                    res.setHeader('Content-Type', 'text/javascript');
                    res.end(body.replace(/"apiUrl": "[^"]*"/, `"apiUrl": "${origin}"`));
                } catch {
                    // The backend may not be listening yet (e.g. it boots slower than Vite).
                    // Respond with a retryable error instead of letting the rejection crash Vite.
                    console.warn(`[nango] ${apiUrl}/env.js not reachable yet, returning 503 (the browser will retry)`);
                    res.statusCode = 503;
                    res.setHeader('Retry-After', '1');
                    res.end('// backend not ready');
                }
            });
        }
    };
}

// Emit a static version.json at the dist root carrying the real git SHA this bundle was built
// from, so an outside observer can read the deployed commit at <origin>/version.json. The SHA
// comes from CI ($GITHUB_SHA), an explicit $GIT_HASH, or local git as a fallback.
function emitVersionJson(): Plugin {
    return {
        name: 'emit-version-json',
        apply: 'build',
        generateBundle() {
            let sha = process.env['GITHUB_SHA'] ?? process.env['GIT_HASH'];
            if (!sha) {
                try {
                    sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
                } catch {
                    sha = '';
                }
            }
            this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ sha }) });
        }
    };
}

function apiProxyConfig() {
    const remoteApi = process.env['REMOTE_API'];
    const remoteUrl = remoteApi ? REMOTE_API_URLS[remoteApi] : null;
    if (remoteApi && !remoteUrl) {
        throw new Error(`[nango] Unknown REMOTE_API="${remoteApi}". Valid values: ${Object.keys(REMOTE_API_URLS).join(', ')}`);
    }

    // Local dev (no REMOTE_API): dashboard talks to the local API directly. Dev CORS trusts
    // any localhost port, so worktree dashboards on 3000/3001/... work without a proxy, and
    // Connect UI reaches the real API (and its OAuth WebSocket) since apiUrl stays the backend
    // URL. We still proxy /env.js because the app requests it as a relative path (it can't
    // know the backend origin until env.js sets window._env) and only the backend serves it.
    if (!remoteUrl) {
        return {
            envProxyPlugin: null,
            proxy: { '/env.js': { target: `http://localhost:${LOCAL_API_PORT}` } }
        };
    }

    // REMOTE_API mode: proxy all API traffic to the remote backend and rewrite apiUrl.
    const proxyOpts = { target: remoteUrl, changeOrigin: true };
    return {
        envProxyPlugin: apiEnvProxyPlugin(remoteUrl),
        proxy: {
            '/api': proxyOpts,
            // Extra routes for connection creation and auth flows; most of the dashboard works with /api alone.
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
        // Vite ignores falsy plugins, so envProxyPlugin can be null in local dev (no REMOTE_API).
        plugins: [react(), svgr(), checker({ typescript: true }), tailwindcss(), envProxyPlugin, emitVersionJson()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src')
            }
        },
        server: { port: DEV_PORT, proxy },
        define: {
            'import.meta.env.VITE_HASH': JSON.stringify(createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 8))
        }
    };
});
