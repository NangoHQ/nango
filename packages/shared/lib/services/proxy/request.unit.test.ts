import { describe, expect, it, vi } from 'vitest';
import { ProxyRequest } from './request.js';
import { getDefaultProxy } from './utils.test';

describe('call', () => {
    it('should make a single successful http call', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/200' })
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
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/400', retries: 1 })
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
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/500', retries: 1 })
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
    });

    it('should dynamically rebuild proxy config on each iteration', { timeout: 10000 }, async () => {
        const fn = vi.fn();
        const getProxyConfig = vi.fn(() => {
            // In an actual scenario we would call getConnection here
            return getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/500', retries: 1 });
        });
        const proxy = new ProxyRequest({
            logger: fn,
            getProxyConfig
        });
        await expect(async () => (await proxy.request()).unwrap()).rejects.toThrowError();
        expect(getProxyConfig).toHaveBeenCalledTimes(2);
    });
});
