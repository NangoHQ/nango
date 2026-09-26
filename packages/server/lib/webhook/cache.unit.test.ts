import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getBotFrameworkJWK, resetBotFrameworkJWKSCache } from './cache.js';

import type { MockInstance } from 'vitest';

const REFRESH_MS = 5 * 60 * 1000;
const TTL_MS = 24 * 60 * 60 * 1000;

const key = (kid: string) => ({ kid, kty: 'RSA', n: 'n', e: 'AQAB' });

describe('getBotFrameworkJWK', () => {
    let get: MockInstance<typeof axios.get>;

    beforeEach(() => {
        vi.useFakeTimers();
        resetBotFrameworkJWKSCache();
        get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { keys: [key('a')] } });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('serves a known kid from the cache', async () => {
        expect(await getBotFrameworkJWK('a')).toEqual(key('a'));
        expect(await getBotFrameworkJWK('a')).toEqual(key('a'));
        expect(get).toHaveBeenCalledOnce();
    });

    it('fetches with a timeout', async () => {
        await getBotFrameworkJWK('a');

        expect(get.mock.calls[0]?.[1]?.timeout).toBe(5000);
    });

    it('shares one fetch between concurrent lookups', async () => {
        expect(await Promise.all([getBotFrameworkJWK('a'), getBotFrameworkJWK('a')])).toEqual([key('a'), key('a')]);
        expect(get).toHaveBeenCalledOnce();
    });

    it('waits for an in flight refetch when a kid is unknown', async () => {
        await getBotFrameworkJWK('a');
        get.mockResolvedValue({ data: { keys: [key('a'), key('b')] } });
        vi.advanceTimersByTime(REFRESH_MS);

        expect(await Promise.all([getBotFrameworkJWK('b'), getBotFrameworkJWK('b')])).toEqual([key('b'), key('b')]);
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('refetches for an unknown kid at most once per refresh window', async () => {
        await getBotFrameworkJWK('a');

        expect(await getBotFrameworkJWK('b')).toBeUndefined();
        expect(get).toHaveBeenCalledOnce();

        get.mockResolvedValue({ data: { keys: [key('a'), key('b')] } });
        vi.advanceTimersByTime(REFRESH_MS);

        expect(await getBotFrameworkJWK('b')).toEqual(key('b'));
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('keeps the refresh window after a failed fetch', async () => {
        get.mockRejectedValue(new Error('network down'));

        await expect(getBotFrameworkJWK('a')).rejects.toThrow('network down');
        expect(await getBotFrameworkJWK('a')).toBeUndefined();
        expect(await getBotFrameworkJWK('b')).toBeUndefined();
        expect(get).toHaveBeenCalledOnce();

        get.mockResolvedValue({ data: { keys: [key('a')] } });
        vi.advanceTimersByTime(REFRESH_MS);

        expect(await getBotFrameworkJWK('a')).toEqual(key('a'));
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('refetches once the cache expires and drops rotated keys', async () => {
        await getBotFrameworkJWK('a');
        get.mockResolvedValue({ data: { keys: [key('c')] } });
        vi.advanceTimersByTime(TTL_MS);

        expect(await getBotFrameworkJWK('a')).toBeUndefined();
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('keeps serving an expired key when the refetch fails', async () => {
        await getBotFrameworkJWK('a');
        get.mockRejectedValue(new Error('network down'));
        vi.advanceTimersByTime(TTL_MS);

        expect(await getBotFrameworkJWK('a')).toEqual(key('a'));
    });

    it.each([
        ['no keys field', {}],
        ['no usable keys', { keys: [{ kid: 'a', kty: 'EC' }] }]
    ])('does not cache a response with %s', async (_name, data) => {
        get.mockResolvedValue({ data });

        await expect(getBotFrameworkJWK('a')).rejects.toThrow();

        get.mockResolvedValue({ data: { keys: [key('a')] } });
        vi.advanceTimersByTime(REFRESH_MS);

        expect(await getBotFrameworkJWK('a')).toEqual(key('a'));
    });

    it('treats an empty endorsement list as no endorsements', async () => {
        get.mockResolvedValue({ data: { keys: [{ ...key('a'), endorsements: [] }] } });

        expect((await getBotFrameworkJWK('a'))?.endorsements).toBeUndefined();
    });

    it('drops keys it cannot use and keeps the rest', async () => {
        get.mockResolvedValue({ data: { keys: [{ kid: 'x', kty: 'EC', crv: 'P-256' }, key('a')] } });

        expect(await getBotFrameworkJWK('a')).toEqual(key('a'));
        expect(await getBotFrameworkJWK('x')).toBeUndefined();
    });
});
