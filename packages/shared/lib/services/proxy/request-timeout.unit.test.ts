import http from 'node:http';
import https from 'node:https';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { ProxyRequest } from './request.js';
import { getDefaultProxy, permissiveTestOutboundPolicy } from './utils.test.js';

import type * as EgressModule from '@nangohq/egress';
import type { AddressInfo } from 'node:net';

// Loopback is always blocked by the real policy, skip the SSRF guards to reach the in-process server
vi.mock('@nangohq/egress', async (importOriginal) => {
    const actual = await importOriginal<typeof EgressModule>();
    return {
        ...actual,
        assertSafeOutboundUrlSync: (url: string) => new URL(url),
        getSafeHttpAgents: () => ({
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true })
        })
    };
});

const IDLE_TIMEOUT_MS = 500;

// Guards the axios behaviour the idle timeout relies on: a hard limit until headers, then inactivity only.
// It is undocumented (https://github.com/axios/axios/issues/5896), so an axios or follow-redirects upgrade could change it.
describe('ProxyRequest idle timeout', () => {
    let server: http.Server | undefined;

    afterEach(async () => {
        server?.closeAllConnections();
        await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
        server = undefined;
    });

    async function startServer(handler: http.RequestListener): Promise<number> {
        const created = http.createServer(handler);
        server = created;
        await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
        return (created.address() as AddressInfo).port;
    }

    function getProxy(port: number, { metered }: { metered: boolean }) {
        return new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: `http://127.0.0.1:${port}` } }, endpoint: '/' }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            outboundPolicy: permissiveTestOutboundPolicy,
            maxWaitMs: Infinity,
            idleTimeoutMs: IDLE_TIMEOUT_MS,
            // The runner meters bytes, which swaps in a custom transport
            ...(metered ? { onBytes: vi.fn() } : {})
        });
    }

    describe.each([{ metered: false }, { metered: true }])('metered: $metered', ({ metered }) => {
        it('should not time out a response that keeps sending data for longer than the timeout', async () => {
            const port = await startServer((_req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.write('{"pad":"');
                let chunks = 0;
                const interval = setInterval(() => {
                    chunks += 1;
                    if (chunks < 10) {
                        res.write('x');
                        return;
                    }
                    clearInterval(interval);
                    res.end('"}');
                }, IDLE_TIMEOUT_MS / 3);
            });

            const start = Date.now();
            const res = (await getProxy(port, { metered }).request()).unwrap();

            expect(res.data).toStrictEqual({ pad: 'xxxxxxxxx' });
            expect(Date.now() - start).toBeGreaterThan(IDLE_TIMEOUT_MS * 2);
        });

        it('should time out a response that stalls mid-body', async () => {
            const port = await startServer((_req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.write('{"value":[');
            });

            const start = Date.now();
            const result = await getProxy(port, { metered }).request();

            expect(result.isErr()).toBe(true);
            expect(Date.now() - start).toBeLessThan(IDLE_TIMEOUT_MS * 4);
        });

        it('should time out a request that never gets response headers', async () => {
            // Accept the request and never answer
            const port = await startServer(() => undefined);

            const start = Date.now();
            const result = await getProxy(port, { metered }).request();

            expect(result.isErr()).toBe(true);
            expect(Date.now() - start).toBeLessThan(IDLE_TIMEOUT_MS * 4);
        });
    });
});
