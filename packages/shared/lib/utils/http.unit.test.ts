import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';

import { loggedFetch } from './http.js';

import type { BufferTransport } from '@nangohq/logs';
import type { AddressInfo } from 'node:net';

async function withServer(handler: http.RequestListener, fn: (baseUrl: string) => Promise<void>): Promise<void> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
        await fn(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

describe('loggedFetch', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should get and log success', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response(JSON.stringify({ code: 200, description: 'OK' }), { status: 200, headers: { 'content-type': 'application/json' } })
                )
        );

        const buffer = logContextGetter.getBuffer({ accountId: 1 });
        const fetchRes = await loggedFetch(
            {
                url: new URL('https://httpstatuses.maor.io/200')
            },
            { logCtx: buffer, context: 'auth', valuesToFilter: [] }
        );
        const { body } = fetchRes.unwrap();
        expect(body).toStrictEqual({ code: 200, description: 'OK' });
        expect((buffer.transport as BufferTransport).buffer).toStrictEqual([
            {
                context: 'auth',
                createdAt: expect.toBeIsoDate(),
                durationMs: expect.any(Number),
                endedAt: expect.toBeIsoDate(),
                error: undefined,
                level: 'info',
                message: 'GET https://httpstatuses.maor.io/200',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/200', body: undefined },
                response: { code: 200, headers: {} },
                source: 'internal',
                type: 'http'
            }
        ]);
    });

    it('should get and log failure', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ code: 500, description: 'Internal Server Error' }), {
                    status: 500,
                    headers: { 'content-type': 'application/json' }
                })
            )
        );

        const buffer = logContextGetter.getBuffer({ accountId: 1 });
        const fetchRes = await loggedFetch(
            {
                url: new URL('https://httpstatuses.maor.io/500')
            },
            { logCtx: buffer, context: 'auth', valuesToFilter: [] }
        );
        const { body } = fetchRes.unwrap();
        expect(body).toStrictEqual({ code: 500, description: 'Internal Server Error' });
        expect((buffer.transport as BufferTransport).buffer).toStrictEqual([
            {
                context: 'auth',
                createdAt: expect.toBeIsoDate(),
                durationMs: expect.any(Number),
                endedAt: expect.toBeIsoDate(),
                error: undefined,
                level: 'error',
                message: 'GET https://httpstatuses.maor.io/500',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/500', body: undefined },
                response: { code: 500, headers: {} },
                meta: {
                    body: { code: 500, description: 'Internal Server Error' }
                },
                source: 'internal',
                type: 'http'
            }
        ]);
    });

    it('should handle network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND doesnotexists.dev') })));

        const buffer = logContextGetter.getBuffer({ accountId: 1 });
        const fetchRes = await loggedFetch(
            {
                url: new URL('https://doesnotexists.dev/500')
            },
            { logCtx: buffer, context: 'auth', valuesToFilter: [] }
        );
        if (fetchRes.isOk()) {
            throw new Error('should have failed');
        }

        expect((buffer.transport as BufferTransport).buffer).toStrictEqual([
            {
                context: 'auth',
                createdAt: expect.toBeIsoDate(),
                durationMs: expect.any(Number),
                endedAt: expect.toBeIsoDate(),
                level: 'error',
                message: 'GET https://doesnotexists.dev/500',
                request: { headers: {}, method: 'GET', url: 'https://doesnotexists.dev/500', body: undefined },
                response: undefined,
                error: {
                    message: 'getaddrinfo ENOTFOUND doesnotexists.dev',
                    name: 'Error',
                    payload: undefined,
                    type: undefined
                },
                source: 'internal',
                type: 'http'
            }
        ]);
    });

    describe('redirect policy', () => {
        it('validates every hop across a multi-redirect chain and returns the final response', async () => {
            await withServer(
                (req, res) => {
                    if (req.url === '/start') {
                        res.writeHead(302, { location: '/step' });
                        res.end();
                        return;
                    }
                    if (req.url === '/step') {
                        res.writeHead(302, { location: '/final' });
                        res.end();
                        return;
                    }
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                },
                async (baseUrl) => {
                    const validated: string[] = [];
                    const buffer = logContextGetter.getBuffer({ accountId: 1 });
                    const fetchRes = await loggedFetch<{ ok: boolean }>(
                        {
                            url: new URL(`${baseUrl}/start`),
                            redirect: {
                                maxRedirects: 5,
                                validate: (target) => {
                                    validated.push(target.href);
                                }
                            }
                        },
                        { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                    );
                    expect(fetchRes.unwrap().body).toStrictEqual({ ok: true });
                    // Both hops (not just the first) must be validated.
                    expect(validated).toEqual([`${baseUrl}/step`, `${baseUrl}/final`]);
                }
            );
        });

        it('fails when a hop is rejected by the validator (blocked IP literal)', async () => {
            await withServer(
                (_req, res) => {
                    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
                    res.end();
                },
                async (baseUrl) => {
                    const buffer = logContextGetter.getBuffer({ accountId: 1 });
                    const fetchRes = await loggedFetch(
                        {
                            url: new URL(`${baseUrl}/start`),
                            redirect: {
                                maxRedirects: 5,
                                validate: (target) => {
                                    if (target.hostname === '169.254.169.254') {
                                        throw new Error('blocked');
                                    }
                                }
                            }
                        },
                        { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                    );
                    expect(fetchRes.isErr()).toBe(true);
                }
            );
        });

        it('fails once maxRedirects is exceeded', async () => {
            await withServer(
                (_req, res) => {
                    res.writeHead(302, { location: '/next' });
                    res.end();
                },
                async (baseUrl) => {
                    const buffer = logContextGetter.getBuffer({ accountId: 1 });
                    const fetchRes = await loggedFetch(
                        {
                            url: new URL(`${baseUrl}/start`),
                            redirect: { maxRedirects: 2, validate: () => undefined }
                        },
                        { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                    );
                    expect(fetchRes.isErr()).toBe(true);
                }
            );
        });

        it('strips credential headers on every redirect hop, same-origin included', async () => {
            await withServer(
                (req, res) => {
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ authorization: req.headers['authorization'] ?? null }));
                },
                async (targetUrl) => {
                    // Records the Authorization header seen at each path on the origin server.
                    const seen: Record<string, string | null> = {};
                    await withServer(
                        (req, res) => {
                            seen[req.url ?? ''] = req.headers['authorization'] ?? null;
                            // Redirect same-origin first, then cross-origin to the second server.
                            if (req.url === '/start') {
                                res.writeHead(302, { location: '/same-origin' });
                                res.end();
                                return;
                            }
                            if (req.url === '/same-origin') {
                                res.writeHead(302, { location: `${targetUrl}/capture` });
                                res.end();
                                return;
                            }
                            res.writeHead(200, { 'content-type': 'application/json' });
                            res.end(JSON.stringify({ authorization: req.headers['authorization'] ?? null }));
                        },
                        async (baseUrl) => {
                            const buffer = logContextGetter.getBuffer({ accountId: 1 });
                            const fetchRes = await loggedFetch<{ authorization: string | null }>(
                                {
                                    url: new URL(`${baseUrl}/start`),
                                    headers: { authorization: 'Basic secret' },
                                    redirect: { maxRedirects: 5, validate: () => undefined }
                                },
                                { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                            );
                            // The original request keeps its credential header.
                            expect(seen['/start']).toBe('Basic secret');
                            // The same-origin redirect hop must NOT retain the credential header.
                            expect(seen['/same-origin']).toBeNull();
                            // Landed on the cross-origin server, which also must not have received it.
                            expect(fetchRes.unwrap().body).toStrictEqual({ authorization: null });
                        }
                    );
                }
            );
        });

        it('refuses to replay a credential-bearing body across origins on a 307 redirect', async () => {
            await withServer(
                (req, res) => {
                    // Cross-origin target: must never receive the original POST body.
                    let received = '';
                    req.on('data', (chunk) => (received += chunk));
                    req.on('end', () => {
                        res.writeHead(200, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ received }));
                    });
                },
                async (targetUrl) => {
                    await withServer(
                        (req, res) => {
                            if (req.url === '/start') {
                                // 307 preserves method + body; point it at a different origin.
                                res.writeHead(307, { location: `${targetUrl}/capture` });
                                res.end();
                                return;
                            }
                            res.writeHead(200);
                            res.end();
                        },
                        async (baseUrl) => {
                            const buffer = logContextGetter.getBuffer({ accountId: 1 });
                            const fetchRes = await loggedFetch(
                                {
                                    url: new URL(`${baseUrl}/start`),
                                    method: 'POST',
                                    body: 'client_secret=super-secret',
                                    redirect: { maxRedirects: 5, validate: () => undefined }
                                },
                                { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                            );
                            // The hop is refused rather than replaying the credential body cross-origin.
                            expect(fetchRes.isErr()).toBe(true);
                        }
                    );
                }
            );
        });

        it('replays a body on a same-origin 307 redirect', async () => {
            await withServer(
                (req, res) => {
                    if (req.url === '/start') {
                        res.writeHead(307, { location: '/final' });
                        res.end();
                        return;
                    }
                    let received = '';
                    req.on('data', (chunk) => (received += chunk));
                    req.on('end', () => {
                        res.writeHead(200, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ received, method: req.method }));
                    });
                },
                async (baseUrl) => {
                    const buffer = logContextGetter.getBuffer({ accountId: 1 });
                    const fetchRes = await loggedFetch<{ received: string; method: string }>(
                        {
                            url: new URL(`${baseUrl}/start`),
                            method: 'POST',
                            body: 'client_secret=super-secret',
                            redirect: { maxRedirects: 5, validate: () => undefined }
                        },
                        { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                    );
                    // Same origin: replaying the body is safe, so the POST + body survive.
                    expect(fetchRes.unwrap().body).toStrictEqual({ received: 'client_secret=super-secret', method: 'POST' });
                }
            );
        });

        it.each([301, 302])('downgrades a POST to GET and drops the body/content-type/content-length on a %i redirect', async (status) => {
            await withServer(
                (req, res) => {
                    if (req.url === '/start') {
                        res.writeHead(status, { location: '/final' });
                        res.end();
                        return;
                    }
                    let received = '';
                    req.on('data', (chunk) => (received += chunk));
                    req.on('end', () => {
                        res.writeHead(200, { 'content-type': 'application/json' });
                        res.end(
                            JSON.stringify({
                                method: req.method,
                                received,
                                contentType: req.headers['content-type'] ?? null,
                                contentLength: req.headers['content-length'] ?? null
                            })
                        );
                    });
                },
                async (baseUrl) => {
                    const buffer = logContextGetter.getBuffer({ accountId: 1 });
                    const fetchRes = await loggedFetch<{ method: string; received: string; contentType: string | null; contentLength: string | null }>(
                        {
                            url: new URL(`${baseUrl}/start`),
                            method: 'POST',
                            headers: { 'content-type': 'application/x-www-form-urlencoded' },
                            body: 'client_secret=super-secret',
                            redirect: { maxRedirects: 5, validate: () => undefined }
                        },
                        { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                    );
                    // 301/302 on an unsafe method must become a bodyless GET: the follow-up carries no body and
                    // neither the content-type nor the content-length of the dropped body are leaked forward.
                    expect(fetchRes.unwrap().body).toStrictEqual({ method: 'GET', received: '', contentType: null, contentLength: null });
                }
            );
        });

        it('returns the original redirect response when the Location header is unparseable (does not throw)', async () => {
            await withServer(
                (req, res) => {
                    if (req.url === '/start') {
                        // `http://` has a scheme but no host, so `new URL()` cannot resolve it even against a base.
                        res.writeHead(302, { location: 'http://', 'content-type': 'application/json' });
                        res.end(JSON.stringify({ redirected: false }));
                        return;
                    }
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ redirected: true }));
                },
                async (baseUrl) => {
                    const buffer = logContextGetter.getBuffer({ accountId: 1 });
                    const fetchRes = await loggedFetch<{ redirected: boolean }>(
                        {
                            url: new URL(`${baseUrl}/start`),
                            redirect: { maxRedirects: 5, validate: () => undefined }
                        },
                        { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                    );
                    // A malformed Location is surfaced as the untouched 3xx response rather than an error.
                    const { res, body } = fetchRes.unwrap();
                    expect(res.status).toBe(302);
                    expect(body).toStrictEqual({ redirected: false });
                }
            );
        });

        it('refuses to replay a credential-bearing body across origins on a 308 redirect', async () => {
            await withServer(
                (req, res) => {
                    // Cross-origin target: must never receive the original POST body.
                    let received = '';
                    req.on('data', (chunk) => (received += chunk));
                    req.on('end', () => {
                        res.writeHead(200, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ received }));
                    });
                },
                async (targetUrl) => {
                    await withServer(
                        (req, res) => {
                            if (req.url === '/start') {
                                // 308, like 307, preserves method + body; point it at a different origin.
                                res.writeHead(308, { location: `${targetUrl}/capture` });
                                res.end();
                                return;
                            }
                            res.writeHead(200);
                            res.end();
                        },
                        async (baseUrl) => {
                            const buffer = logContextGetter.getBuffer({ accountId: 1 });
                            const fetchRes = await loggedFetch(
                                {
                                    url: new URL(`${baseUrl}/start`),
                                    method: 'POST',
                                    body: 'client_secret=super-secret',
                                    redirect: { maxRedirects: 5, validate: () => undefined }
                                },
                                { logCtx: buffer, context: 'auth', valuesToFilter: [] }
                            );
                            // 308 shares the 307 code path; verify it too refuses the cross-origin body replay.
                            expect(fetchRes.isErr()).toBe(true);
                        }
                    );
                }
            );
        });
    });
});
