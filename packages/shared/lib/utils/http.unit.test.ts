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
        it('validates every hop and returns the final response', async () => {
            await withServer(
                (req, res) => {
                    if (req.url === '/start') {
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
                    expect(validated).toEqual([`${baseUrl}/final`]);
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

        it('strips credential headers on cross-origin hops but keeps them same-origin', async () => {
            await withServer(
                (req, res) => {
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ authorization: req.headers['authorization'] ?? null }));
                },
                async (targetUrl) => {
                    await withServer(
                        (req, res) => {
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
                            // Landed on the cross-origin server, which must not have received the credential header.
                            expect(fetchRes.unwrap().body).toStrictEqual({ authorization: null });
                        }
                    );
                }
            );
        });
    });
});
