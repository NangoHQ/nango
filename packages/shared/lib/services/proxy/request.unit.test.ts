import { describe, expect, it, vi } from 'vitest';
import { ProxyRequest } from './request.js';
import { getDefaultProxy } from './utils.test';
import { getTestConnection } from '../connections/utils.test.js';

describe('call', () => {
    it('should make a single successful http call', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/200' }),
            getConnection: () => getTestConnection()
        });
        const res = (await proxy.request()).unwrap();
        expect(res).toMatchObject({ status: 200 });
        expect(fn).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                level: 'info',
                type: 'http',
                message: 'GET https://httpstatuses.maor.io/200',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/200' },
                response: expect.objectContaining({ code: 200 })
            })
        );
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should make a single failed http call', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/400', retries: 1 }),
            getConnection: () => getTestConnection()
        });
        await expect(async () => (await proxy.request()).unwrap()).rejects.toThrowError();
        expect(fn).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                level: 'error',
                type: 'http',
                message: 'GET https://httpstatuses.maor.io/400',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/400' },
                response: expect.objectContaining({ code: 400 }),
                retry: { max: 1, attempt: 0, waited: 0 }
            })
        );
        expect(fn).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                level: 'warn',
                message: 'Skipping retry HTTP call (reason: not_retryable) [1/1]'
            })
        );
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retries failed http call', { timeout: 10000 }, async () => {
        const fn = vi.fn();
        const getConnection = vi.fn(() => {
            return getTestConnection();
        });
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/500', retries: 1 }),
            getConnection
        });
        await expect(async () => (await proxy.request()).unwrap()).rejects.toThrowError();
        expect(fn).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                level: 'error',
                type: 'http',
                message: 'GET https://httpstatuses.maor.io/500',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/500' },
                response: expect.objectContaining({ code: 500 }),
                retry: { max: 1, attempt: 0, waited: 0 }
            })
        );
        expect(fn).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                level: 'warn',
                message: 'Retrying HTTP call (reason: status_code_500). Waiting for 3000ms [1/1]'
            })
        );
        expect(fn).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                level: 'error',
                type: 'http',
                message: 'GET https://httpstatuses.maor.io/500',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/500' },
                response: expect.objectContaining({ code: 500 }),
                retry: { max: 1, attempt: 1, waited: 3000 }
            })
        );
        expect(fn).toHaveBeenCalledTimes(3);

        // should dynamically rebuild proxy config on each iteration
        expect(getConnection).toHaveBeenCalledTimes(2);
    });
});
