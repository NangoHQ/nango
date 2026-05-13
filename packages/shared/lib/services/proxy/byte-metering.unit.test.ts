import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProxyRequest } from './request.js';
import { getDefaultProxy } from './utils.test.js';
import { getTestConnection } from '../../seeders/connection.seeder.js';

import type { MeteredBytes } from './byte-metering-transport.js';
import type { AddressInfo } from 'node:net';

interface ServerHandle {
    server: http.Server;
    port: number;
}

// mock timers/promises to avoid actual delays during proxy retries in tests
vi.mock('node:timers/promises', () => ({
    setTimeout: vi.fn().mockResolvedValue(undefined)
}));

async function startServer(handler: http.RequestListener): Promise<ServerHandle> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { server, port: (server.address() as AddressInfo).port };
}

async function closeServer({ server }: ServerHandle): Promise<void> {
    await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe('ProxyRequest onBytes (socket metering)', () => {
    let handle: ServerHandle | undefined;

    afterEach(async () => {
        if (handle) {
            await closeServer(handle);
            handle = undefined;
        }
    });

    it('fires onBytes with byte transfer counts for json responseType', async () => {
        const responseBody = JSON.stringify({ hello: 'world' });
        handle = await startServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(responseBody);
        });

        const onBytes = vi.fn();
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes
        });

        const result = (await proxy.request()).unwrap();
        expect(result.status).toBe(200);

        expect(onBytes).toHaveBeenCalledTimes(1);
        const bytes = onBytes.mock.calls[0]![0] as MeteredBytes;
        expect(bytes.received).toBeGreaterThanOrEqual(Buffer.byteLength(responseBody));
        expect(bytes.sent).toBeGreaterThan(0);
    });

    it('fires onBytes for stream responseType after upstream body completes', async () => {
        const responseBody = Buffer.alloc(2048, 'x');
        handle = await startServer((_req, res) => {
            res.writeHead(200);
            res.end(responseBody);
        });

        const onBytes = vi.fn();
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/',
                responseType: 'stream'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes
        });

        const result = (await proxy.request()).unwrap();
        expect(onBytes).not.toHaveBeenCalled();

        // Drain the stream — finished() listener fires automatically when done.
        for await (const _chunk of result.data) {
            /* drain */
        }
        await new Promise((resolve) => setTimeout(resolve, 0)); // flush microtasks

        expect(onBytes).toHaveBeenCalledTimes(1);
        expect(onBytes.mock.calls[0]![0].received).toBeGreaterThanOrEqual(responseBody.length);
    });

    it('fires onBytes for stream responseType when connection drops mid-stream', async () => {
        handle = await startServer((_req, res) => {
            res.writeHead(200, { 'content-length': '10000' });
            res.write(Buffer.from('partial data'));
            res.socket?.destroy();
        });

        const fires: MeteredBytes[] = [];
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/',
                responseType: 'stream'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes: (c) => {
                fires.push({ ...c });
            }
        });

        const result = await proxy.request();
        if (result.isOk()) {
            // headers arrived before socket destroyed — stream must error on drain
            await expect(async () => {
                for await (const _chunk of result.value.data) {
                    /* drain */
                }
            }).rejects.toThrow();
            await new Promise((resolve) => setTimeout(resolve, 0)); // flush microtasks
        }

        expect(fires).toHaveLength(1);
    });

    it('fires onBytes exactly once for stream responseType when connection drops mid-stream', async () => {
        handle = await startServer((_req, res) => {
            res.writeHead(200, { 'content-length': '10000' });
            res.write(Buffer.from('partial data'));
            res.socket?.destroy();
        });

        const fires: MeteredBytes[] = [];
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/',
                responseType: 'stream'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes: (c) => {
                fires.push({ ...c });
            }
        });

        const result = await proxy.request();
        if (result.isOk()) {
            await expect(async () => {
                for await (const _chunk of result.value.data) {
                    /* drain */
                }
            }).rejects.toThrow();
        }

        // give event loop time to process any lingering error events that could trigger a duplicate fire
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(fires).toHaveLength(1);
    });

    it('fires onBytes for arraybuffer responseType', async () => {
        const responseBody = Buffer.from('arraybuffer payload');
        handle = await startServer((_req, res) => {
            res.writeHead(200);
            res.end(responseBody);
        });

        const onBytes = vi.fn();
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/',
                responseType: 'arraybuffer'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes
        });

        await proxy.request();

        expect(onBytes).toHaveBeenCalledTimes(1);
        expect(onBytes.mock.calls[0]![0].received).toBeGreaterThanOrEqual(responseBody.length);
    });

    it('counts request bytes for POST with JSON body', async () => {
        const requestBody = { hello: 'world', nested: { foo: 'bar' } };
        const serialized = JSON.stringify(requestBody);
        const responseBody = 'ok';

        handle = await startServer((req, res) => {
            req.on('data', () => {});
            req.on('end', () => {
                res.writeHead(200);
                res.end(responseBody);
            });
        });

        const onBytes = vi.fn();
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/',
                method: 'POST',
                data: requestBody
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes
        });

        await proxy.request();

        expect(onBytes).toHaveBeenCalledTimes(1);
        expect(onBytes.mock.calls[0]![0].sent).toBeGreaterThanOrEqual(Buffer.byteLength(serialized));
        expect(onBytes.mock.calls[0]![0].received).toBeGreaterThanOrEqual(Buffer.byteLength(responseBody));
    });

    it('does not inject transport when onBytes is not provided', async () => {
        handle = await startServer((_req, res) => {
            res.writeHead(200);
            res.end('ok');
        });

        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
        });

        const result = (await proxy.request()).unwrap();
        expect(result.status).toBe(200);
        expect(proxy.axiosConfig?.transport).toBeUndefined();
    });

    it('fires onBytes per retry attempt', async () => {
        const errorResponse = 'fail'.repeat(10);
        const successResponse = 'yeehaw!'.repeat(100);

        let calls = 0;
        handle = await startServer((_req, res) => {
            calls++;
            if (calls <= 2) {
                res.writeHead(500);
                res.end(errorResponse);
                return;
            }
            res.writeHead(200);
            res.end(successResponse);
        });

        const onBytes = vi.fn();
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/',
                retries: 3
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes
        });

        await proxy.request();

        expect(onBytes).toHaveBeenCalledTimes(3);
        expect(onBytes.mock.calls[0]![0].received).toBeGreaterThan(Buffer.byteLength(errorResponse));
        expect(onBytes.mock.calls[1]![0].received).toBeGreaterThan(Buffer.byteLength(errorResponse));
        expect(onBytes.mock.calls[2]![0].received).toBeGreaterThan(Buffer.byteLength(successResponse));
    });

    it('swallows errors thrown by onBytes', async () => {
        handle = await startServer((_req, res) => {
            res.writeHead(200);
            res.end('ok');
        });

        const onBytes = vi.fn(() => {
            throw new Error('metering function went kaboom!');
        });

        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes
        });

        const result = (await proxy.request()).unwrap();
        expect(result.status).toBe(200);
        expect(onBytes).toHaveBeenCalledTimes(1);
    });

    it('aggregates redirect hops into a single fire per attempt', async () => {
        const finalBody = 'destination';
        handle = await startServer((req, res) => {
            if (req.url === '/start') {
                res.writeHead(302, { location: `http://127.0.0.1:${handle!.port}/end` });
                res.end('redirecting');
                return;
            }
            if (req.url === '/end') {
                res.writeHead(200);
                res.end(finalBody);
                return;
            }
            res.writeHead(404);
            res.end();
        });

        const onBytes = vi.fn();
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/start'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes
        });

        await proxy.request();

        expect(onBytes).toHaveBeenCalledTimes(1);
        const bytes = onBytes.mock.calls[0]![0] as MeteredBytes;
        expect(bytes.received).toBeGreaterThanOrEqual(Buffer.byteLength(finalBody));
    });

    it('fires onBytes once on clean redirection chains', async () => {
        handle = await startServer((req, res) => {
            if (req.url === '/start') {
                res.writeHead(302, { location: `http://127.0.0.1:${handle!.port}/end` });
                res.end();
                return;
            }
            res.writeHead(200);
            res.end('ok');
        });

        const onBytes = vi.fn();
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({
                provider: { proxy: { base_url: `http://127.0.0.1:${handle.port}` } },
                endpoint: '/start'
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onBytes
        });

        await proxy.request();

        expect(onBytes).toHaveBeenCalledTimes(1);
    });
});
