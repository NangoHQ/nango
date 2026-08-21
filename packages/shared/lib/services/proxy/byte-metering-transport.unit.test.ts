import http from 'node:http';
import zlib from 'node:zlib';

import axios from 'axios';
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
        const transport = createMeteringTransport({ onBytes });
        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/' }, (res) => {
            void drainResponse(res);
        });
        req.end();

        const bytes = await promise;
        expect(bytes.received).toBeGreaterThanOrEqual(body.length);
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
        const transport = createMeteringTransport({ onBytes });
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
    });

    it('counts sent bytes for headers on GET request', async () => {
        handle = await startServer((_req, res) => {
            res.writeHead(200);
            res.end('ok');
        });

        const { onBytes, promise } = onBytesAwaitable();
        const transport = createMeteringTransport({ onBytes });
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
        const transport = createMeteringTransport({ onBytes });
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
        const transport = createMeteringTransport({ onBytes });
        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/' }, (res) => {
            void drainResponse(res);
        });
        req.end();

        const bytes = await promise;
        expect(bytes.received).toBeGreaterThanOrEqual(6000);
    });

    it('fires onBytes for redirect hops (follow-redirects destroys 3xx body)', async () => {
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
        const transport = createMeteringTransport({ onBytes: wrapped });

        const req = transport.request({ host: '127.0.0.1', port: handle.port, method: 'GET', path: '/' }, (res) => {
            void drainResponse(res);
        });
        req.end();

        await promise;
        expect(hops).toHaveLength(2);
    });

    it('enforces the maxRedirects cap passed to the transport', async () => {
        // Axios does not copy config.maxRedirects into options.maxRedirects for custom transports, so the
        // cap must be applied by the transport itself; otherwise follow-redirects defaults to 21.
        let hits = 0;
        handle = await startServer((_req, res) => {
            hits++;
            res.writeHead(302, { location: '/next' });
            res.end();
        });

        const transport = createMeteringTransport({ onBytes: () => {}, maxRedirects: 2 });
        await expect(
            axios.request({
                url: `http://127.0.0.1:${handle.port}/`,
                method: 'GET',
                transport: transport as any
            })
        ).rejects.toMatchObject({ code: 'ERR_FR_TOO_MANY_REDIRECTS' });

        // Initial request + 2 followed redirects = 3 hits, then capped (well under follow-redirects' default of 21).
        expect(hits).toBe(3);
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
        const transport = createMeteringTransport({ onBytes: wrapped });
        const req = transport.request({ host: '127.0.0.1', port, method: 'GET', path: '/' }, () => {});
        req.on('error', () => {});
        req.end();

        await promise;
        // give the event loop time to process any remaining error events — a duplicate fire would push to `fires` here
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(fires).toHaveLength(1);
    });

    it('does not fire onBytes when request is destroyed before any bytes are written', async () => {
        handle = await startServer((_req, res) => res.end('ok'));
        const { port } = handle;

        const fires: MeteredBytes[] = [];
        const transport = createMeteringTransport({ onBytes: (c) => fires.push({ ...c }) });
        // Destroy before req.end() so no HTTP headers are flushed — sent and received both remain 0.
        const req = transport.request({ host: '127.0.0.1', port, method: 'GET', path: '/' }, () => {});
        req.destroy();
        req.on('error', () => {});

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(fires).toHaveLength(0);
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
        const transport = createMeteringTransport({ onBytes: (c) => hops.push({ ...c }) });
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

    describe('userBeforeRedirect (header forwarding through redirects)', () => {
        it('restores Authorization after cross-host redirect strips it', async () => {
            // follow-redirects strips sensitive headers (Authorization, Cookie) on cross-host
            // redirects. userBeforeRedirect must re-add them; a same-host redirect would not
            // trigger stripping, so we need two servers on different ports here.
            const targetHandle = await startServer((req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ headers: req.headers }));
            });
            const targetPort = targetHandle.port;

            handle = await startServer((_req, res) => {
                res.writeHead(302, { location: `http://127.0.0.1:${targetPort}/target` });
                res.end();
            });

            const headersToForward = { authorization: 'Bearer test-token', 'x-custom': 'value' };
            const userBeforeRedirect = (options: Record<string, unknown>) => {
                const hdrs = options['headers'] as Record<string, string>;
                for (const [key, value] of Object.entries(headersToForward)) {
                    hdrs[key] = value;
                }
            };

            const transport = createMeteringTransport({ onBytes: () => {}, beforeRedirect: userBeforeRedirect });
            try {
                const res = await axios.request({
                    url: `http://127.0.0.1:${handle.port}/`,
                    method: 'GET',
                    headers: { ...headersToForward },
                    beforeRedirect: userBeforeRedirect as any,
                    transport: transport as any
                });
                expect(res.data.headers['authorization']).toBe('Bearer test-token');
                expect(res.data.headers['x-custom']).toBe('value');
            } finally {
                await closeServer(targetHandle);
            }
        });

        it('strips Authorization on cross-host redirect when userBeforeRedirect is omitted', async () => {
            const targetHandle = await startServer((req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ headers: req.headers }));
            });
            const targetPort = targetHandle.port;

            handle = await startServer((_req, res) => {
                res.writeHead(302, { location: `http://127.0.0.1:${targetPort}/target` });
                res.end();
            });

            const transport = createMeteringTransport({ onBytes: () => {} });
            try {
                const res = await axios.request({
                    url: `http://127.0.0.1:${handle.port}/`,
                    method: 'GET',
                    headers: { authorization: 'Bearer test-token' },
                    transport: transport as any
                });
                expect(res.data.headers['authorization']).toBeUndefined();
            } finally {
                await closeServer(targetHandle);
            }
        });
    });

    it('does not fire onBytes when keep-alive socket reuse produces zero byte delta', async () => {
        // A keep-alive socket may already have bytesRead/bytesWritten > 0 from a prior request.
        // If the next request completes with 0 delta bytes (e.g. aborted before any I/O), onBytes
        // must not fire to avoid emitting a zero-value event to the metering pipeline.
        handle = await startServer((_req, res) => res.end('ok'));
        const agent = new http.Agent({ keepAlive: true });

        const fires: MeteredBytes[] = [];
        const transport = createMeteringTransport({ onBytes: (c) => fires.push({ ...c }) });
        const { port } = handle;

        // First request — establishes the keep-alive connection and accumulates socket bytes.
        await new Promise<void>((resolve, reject) => {
            const req = transport.request({ agent, host: '127.0.0.1', port, method: 'GET', path: '/' }, (res) => {
                void drainResponse(res)
                    .then(() => resolve())
                    .catch(reject);
            });
            req.on('error', reject);
            req.end();
        });
        const firstFires = fires.length;

        // Simulate a request that would produce startRead === sock.bytesRead by destroying the socket
        // immediately — the delta for sent and received both remain 0, so onBytes must be suppressed.
        const req2 = transport.request({ agent, host: '127.0.0.1', port, method: 'GET', path: '/' }, () => {});
        req2.destroy();
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Only the first request should have fired; the destroyed request had 0-byte delta.
        expect(fires).toHaveLength(firstFires);
        agent.destroy();
    });

    it('does not double-fire when both request write and response read complete', async () => {
        handle = await startServer((req, res) => {
            req.on('data', () => {});
            req.on('end', () => res.end('done'));
        });

        const fires: MeteredBytes[] = [];
        const transport = createMeteringTransport({ onBytes: (c) => fires.push({ ...c }) });
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
