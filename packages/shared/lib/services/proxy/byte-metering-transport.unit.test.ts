import http from 'node:http';
import zlib from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { createMeteringTransport } from './byte-metering-transport.js';

import type { MeteredBytes } from './byte-metering-transport.js';
import type { AddressInfo } from 'node:net';

interface ServerHandle {
    server: http.Server;
    port: number;
}

async function startServer(handler: http.RequestListener): Promise<ServerHandle> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    return { server, port };
}

async function closeServer({ server }: ServerHandle): Promise<void> {
    await new Promise<void>((resolve) => server.close(() => resolve()));
}

// wires up a Promise-based awaitable for the onBytes event
function onBytesAwaitable(): { onBytes: (bytes: MeteredBytes) => void; promise: Promise<MeteredBytes> } {
    const { promise, resolve } = Promise.withResolvers<MeteredBytes>();
    return { onBytes: (bytes) => resolve(bytes), promise };
}

function drainResponse(res: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
    });
}

describe('createMeteringTransport (socket bytes)', () => {
    let handle: ServerHandle | undefined;

    afterEach(async () => {
        if (handle) {
            await closeServer(handle);
            handle = undefined;
        }
    });

    it('received socket bytes exceed plain body length for a simple GET', async () => {
        const body = Buffer.from('hello world');
        handle = await startServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.end(body);
        });

        const { onBytes, promise } = onBytesAwaitable();
        const transport = createMeteringTransport(onBytes);
        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/' }, (res) => {
            void drainResponse(res);
        });
        req.end();

        const bytes = await promise;
        expect(bytes.received).toBeGreaterThanOrEqual(body.length);
        expect(bytes.partial).toBe(false);
        expect(bytes.sent).toBeGreaterThan(0); // request line + headers
    });

    it('counts nonzero sent bytes for POST with body', async () => {
        const requestBody = Buffer.from(JSON.stringify({ hello: 'world' }));
        handle = await startServer((req, res) => {
            req.on('data', () => {});
            req.on('end', () => {
                res.writeHead(200);
                res.end('ok');
            });
        });

        const { onBytes, promise } = onBytesAwaitable();
        const transport = createMeteringTransport(onBytes);
        const req = transport.request(
            {
                host: '127.0.0.1',
                port: handle.port,
                method: 'POST',
                path: '/',
                headers: { 'content-length': String(requestBody.length), 'content-type': 'application/json' }
            },
            (res) => {
                void drainResponse(res);
            }
        );
        req.write(requestBody);
        req.end();

        const bytes = await promise;
        expect(bytes.sent).toBeGreaterThanOrEqual(requestBody.length);
        expect(bytes.received).toBeGreaterThan('ok'.length);
        expect(bytes.partial).toBe(false);
    });

    it('counts sent bytes for headers on GET request', async () => {
        handle = await startServer((_req, res) => {
            res.writeHead(200);
            res.end('ok');
        });

        const { onBytes, promise } = onBytesAwaitable();
        const transport = createMeteringTransport(onBytes);
        const headers = { 'x-custom-header': 'somevalue', accept: 'application/json' };
        const headerBytes = Buffer.byteLength(
            Object.entries(headers)
                .map(([k, v]) => `${k}: ${v}\r\n`)
                .join('')
        );
        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/', headers }, (res) => {
            void drainResponse(res);
        });
        req.end();

        const bytes = await promise;
        expect(bytes.sent).toBeGreaterThanOrEqual(headerBytes);
    });

    it('gzip response contributes compressed size to received socket bytes', async () => {
        const original = 'the quick brown fox '.repeat(50);
        const compressed = zlib.gzipSync(original);

        handle = await startServer((_req, res) => {
            res.writeHead(200, { 'content-encoding': 'gzip' });
            res.end(compressed);
        });

        const { onBytes, promise } = onBytesAwaitable();
        const transport = createMeteringTransport(onBytes);
        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/' }, (res) => {
            void drainResponse(res);
        });
        req.end();

        const bytes = await promise;
        expect(bytes.received).toBeGreaterThanOrEqual(compressed.length);
        expect(bytes.received).toBeLessThan(Buffer.byteLength(original));
    });

    it('streaming response accumulates socket received bytes', async () => {
        handle = await startServer((_req, res) => {
            res.writeHead(200);
            res.write(Buffer.alloc(1000, 'a'));
            res.write(Buffer.alloc(2000, 'b'));
            res.end(Buffer.alloc(3000, 'c'));
        });

        const { onBytes, promise } = onBytesAwaitable();
        const transport = createMeteringTransport(onBytes);
        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/' }, (res) => {
            void drainResponse(res);
        });
        req.end();

        const bytes = await promise;
        expect(bytes.received).toBeGreaterThanOrEqual(6000);
        expect(bytes.partial).toBe(false);
    });

    it('marks partial=true when the server destroys connection mid-response', async () => {
        handle = await startServer((_req, res) => {
            res.writeHead(200, { 'content-length': '10000' });
            res.write(Buffer.from('partial'));
            res.socket?.destroy();
        });

        const { onBytes, promise } = onBytesAwaitable();
        const transport = createMeteringTransport(onBytes);
        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/' }, (res) => {
            res.on('data', () => {});
            res.on('error', () => {});
        });
        req.on('error', () => {});
        req.end();

        const bytes = await promise;
        expect(bytes.partial).toBe(true);
    });

    it('marks partial=false for redirect hops (follow-redirects destroys 3xx body)', async () => {
        handle = await startServer((req, res) => {
            if (req.url === '/') {
                res.writeHead(301, { location: '/final' });
                res.end();
            } else {
                res.writeHead(200);
                res.end('ok');
            }
        });

        const { onBytes, promise } = onBytesAwaitable();
        const hops: MeteredBytes[] = [];
        const wrapped = (bytes: MeteredBytes) => {
            hops.push({ ...bytes });
            if (hops.length === 2) onBytes(bytes);
        };
        const transport = createMeteringTransport(wrapped);

        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/' }, (res) => {
            void drainResponse(res);
        });
        req.end();

        await promise;
        expect(hops).toHaveLength(2);
        expect(hops[0]!.partial).toBe(false); // redirect hop: follow-redirects destroys body, not an error
        expect(hops[1]!.partial).toBe(false); // final hop: clean response
    });

    it('fires exactly once on connect failure', async () => {
        handle = await startServer((_req, res) => res.end());
        const port = handle.port;
        await closeServer(handle);
        handle = undefined;

        const { onBytes, promise } = onBytesAwaitable();
        const fires: MeteredBytes[] = [];
        const wrapped = (bytes: MeteredBytes) => {
            fires.push(bytes);
            onBytes(bytes);
        };
        const transport = createMeteringTransport(wrapped);
        const req = transport.request({ host: '127.0.0.1', port, method: 'GET', path: '/' }, () => {});
        req.on('error', () => {});
        req.end();

        const bytes = await promise;
        expect(bytes.partial).toBe(true);
        // give the event loop time to process any remaining error events — a duplicate fire would push to `fires` here
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(fires).toHaveLength(1);
    });

    it('produces independent deltas across sequential requests on a keep-alive agent', async () => {
        let callCount = 0;
        const largeBody = Buffer.alloc(2000, 'a');
        const smallBody = Buffer.from('x');

        handle = await startServer((_req, res) => {
            callCount++;
            res.writeHead(200);
            res.end(callCount === 1 ? largeBody : smallBody);
        });

        const agent = new http.Agent({ keepAlive: true });
        const hops: MeteredBytes[] = [];
        const transport = createMeteringTransport((c) => hops.push({ ...c }));
        const { port } = handle;

        for (let i = 0; i < 2; i++) {
            await new Promise<void>((resolve, reject) => {
                const req = transport.request({ agent, host: '127.0.0.1', port, method: 'GET', path: '/' }, (res) => {
                    void drainResponse(res)
                        .then(() => resolve())
                        .catch(reject);
                });
                req.on('error', reject);
                req.end();
            });
        }

        expect(hops).toHaveLength(2);
        expect(hops[0]!.received).toBeGreaterThanOrEqual(largeBody.length);
        expect(hops[1]!.received).toBeGreaterThanOrEqual(smallBody.length);
        expect(hops[1]!.received).toBeLessThan(largeBody.length); // delta reset — not accumulating across hops
        agent.destroy();
    });

    it('does not double-fire when both request write and response read complete', async () => {
        handle = await startServer((req, res) => {
            req.on('data', () => {});
            req.on('end', () => res.end('done'));
        });

        const fires: MeteredBytes[] = [];
        const transport = createMeteringTransport((c) => fires.push({ ...c }));
        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'POST', path: '/' }, (res) => {
            void drainResponse(res);
        });
        req.end('payload');

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(fires).toHaveLength(1);
        expect(fires[0]!.sent).toBeGreaterThan(Buffer.byteLength('payload'));
        expect(fires[0]!.received).toBeGreaterThanOrEqual(Buffer.byteLength('done'));
    });
});
