import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpFetch } from './http.js';

const url = 'http://example.com';

function makeSocketError(): Error {
    return Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' });
}

function makeCauseError(code: string, message: string): Error {
    const cause = Object.assign(new Error(message), { code });
    return Object.assign(new TypeError('fetch failed'), { cause });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('httpFetch', () => {
    describe('retryable network errors', () => {
        describe('error with code on root', () => {
            it('retries and succeeds when fetch eventually resolves', async () => {
                const fetchMock = vi
                    .fn()
                    .mockRejectedValueOnce(makeSocketError())
                    .mockRejectedValueOnce(makeSocketError())
                    .mockResolvedValueOnce(new Response('ok', { status: 200 }));
                vi.stubGlobal('fetch', fetchMock);

                const res = await httpFetch(url, undefined, { numOfAttempts: 3, startingDelay: 0 });

                expect(fetchMock).toHaveBeenCalledTimes(3);
                expect(res.status).toBe(200);
            });

            it('returns 502 after all retries exhausted', async () => {
                vi.stubGlobal('fetch', vi.fn().mockRejectedValue(makeSocketError()));

                const res = await httpFetch(url, undefined, { numOfAttempts: 3, startingDelay: 0 });

                expect(res.status).toBe(502);
            });
        });

        describe.each([
            ['UND_ERR_SOCKET', 'other side closed'],
            ['EPIPE', 'write EPIPE']
        ])('error with code on cause: %s', (code, message) => {
            it('retries and succeeds when fetch eventually resolves', async () => {
                const fetchMock = vi
                    .fn()
                    .mockRejectedValueOnce(makeCauseError(code, message))
                    .mockRejectedValueOnce(makeCauseError(code, message))
                    .mockResolvedValueOnce(new Response('ok', { status: 200 }));
                vi.stubGlobal('fetch', fetchMock);

                const res = await httpFetch(url, undefined, { numOfAttempts: 3, startingDelay: 0 });

                expect(fetchMock).toHaveBeenCalledTimes(3);
                expect(res.status).toBe(200);
            });

            it('returns 502 after all retries exhausted', async () => {
                vi.stubGlobal('fetch', vi.fn().mockRejectedValue(makeCauseError(code, message)));

                const res = await httpFetch(url, undefined, { numOfAttempts: 3, startingDelay: 0 });

                expect(res.status).toBe(502);
            });
        });
    });

    describe('non-retryable errors', () => {
        it('returns 502 immediately without retrying', async () => {
            const fetchMock = vi.fn().mockRejectedValue(new Error('some non-network error'));
            vi.stubGlobal('fetch', fetchMock);

            const res = await httpFetch(url, undefined, { numOfAttempts: 3, startingDelay: 0 });

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(res.status).toBe(502);
        });
    });

    describe('HTTP error responses', () => {
        it('retries on 500 status', async () => {
            const fetchMock = vi
                .fn()
                .mockResolvedValueOnce(new Response('error', { status: 500 }))
                .mockResolvedValueOnce(new Response('ok', { status: 200 }));
            vi.stubGlobal('fetch', fetchMock);

            const res = await httpFetch(url, undefined, { numOfAttempts: 3, startingDelay: 0 });

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(res.status).toBe(200);
        });

        it('retries on 429 status', async () => {
            const fetchMock = vi
                .fn()
                .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
                .mockResolvedValueOnce(new Response('ok', { status: 200 }));
            vi.stubGlobal('fetch', fetchMock);

            const res = await httpFetch(url, undefined, { numOfAttempts: 3, startingDelay: 0 });

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(res.status).toBe(200);
        });

        it('does not retry on 400 status', async () => {
            const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
            vi.stubGlobal('fetch', fetchMock);

            const res = await httpFetch(url, undefined, { numOfAttempts: 3, startingDelay: 0 });

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(res.status).toBe(400);
        });
    });
});
