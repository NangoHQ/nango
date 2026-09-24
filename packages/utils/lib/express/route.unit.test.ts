import { afterEach, describe, expect, it, vi } from 'vitest';

import { routeFetch } from './route.js';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
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

describe('routeFetch', () => {
    it('sends JSON content-type and does not attach extra headers', async () => {
        process.env['NANGO_INTERNAL_AUTH_TOKEN'] = 'shared-secret';
        const fetchMock = stubFetch();

        await routeFetch('https://example.test', route)({ body: { ping: 'pong' } });

        expect(requestHeaders(fetchMock)).toEqual({ 'content-type': 'application/json' });
    });
});
