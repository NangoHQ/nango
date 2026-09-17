import { afterEach, describe, expect, it, vi } from 'vitest';

import { internalRouteFetch } from './fetch.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

const route = { path: '/v1/dequeue', method: 'POST' } as never;

function stubFetch() {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function requestHeaders(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
    return (fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers;
}

describe('internalRouteFetch', () => {
    it('attaches the internal credential and keeps JSON content-type', async () => {
        const fetchMock = stubFetch();

        await internalRouteFetch('http://orchestrator.test', route, { token: 'shared-secret' })({ body: { ping: 'pong' } });

        expect(requestHeaders(fetchMock)).toEqual({
            'content-type': 'application/json',
            Authorization: 'Bearer shared-secret'
        });
    });

    it('attaches no Authorization header when no token is configured', async () => {
        const fetchMock = stubFetch();

        await internalRouteFetch('http://orchestrator.test', route)({ body: { ping: 'pong' } });

        expect(requestHeaders(fetchMock)).toEqual({ 'content-type': 'application/json' });
    });
});
