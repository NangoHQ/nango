import { describe, expect, it } from 'vitest';

import { logContextGetter } from '@nangohq/logs';

import { loggedFetch } from './http.js';

import type { BufferTransport } from '@nangohq/logs/lib/transport';

describe('loggedFetch', () => {
    it('should get and log success', async () => {
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
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/200' },
                response: { code: 200, headers: {} },
                source: 'internal',
                type: 'http'
            }
        ]);
    });

    it('should get and log failure', async () => {
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
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/500' },
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
                request: { headers: {}, method: 'GET', url: 'https://doesnotexists.dev/500' },
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
});
