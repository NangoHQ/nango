import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { ProxyRequest } from './request.js';
import { getDefaultProxy } from './utils.test.js';
import { getTestConnection } from '../../seeders/connection.seeder.js';

import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

function createAxiosError(status: number): AxiosError {
    const err = new AxiosError(`HTTP ${status}`);
    err.response = {
        status,
        data: {},
        headers: {},
        statusText: 'Error',
        config: {} as InternalAxiosRequestConfig
    };
    return err;
}

function createSuccessResponse(): AxiosResponse {
    return {
        status: 200,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'OK'
    };
}

describe('call', () => {
    it('should make a single successful http call', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/200' }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
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
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
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
            getConnection,
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
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

    it('should call onRefreshToken when error status is in refreshTokenOn, then retry and succeed', async () => {
        const logger = vi.fn();
        const onRefreshToken = vi.fn();
        const proxy = new ProxyRequest({
            logger,
            proxyConfig: getDefaultProxy({
                provider: { auth_mode: 'OAUTH2', proxy: { base_url: 'https://example.com' } },
                endpoint: '/api',
                retries: 2,
                refreshTokenOn: [401]
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onRefreshToken
        });
        const httpCallSpy = vi.spyOn(proxy, 'httpCall').mockRejectedValueOnce(createAxiosError(401)).mockResolvedValueOnce(createSuccessResponse());

        const res = await proxy.request();

        expect(res.isOk()).toBe(true);
        expect(onRefreshToken).toHaveBeenCalledTimes(1);
        expect(httpCallSpy).toHaveBeenCalledTimes(2);
        expect(logger).toHaveBeenCalledWith(
            expect.objectContaining({
                level: 'warn',
                message: expect.stringContaining('Retrying HTTP call (reason: refresh_token)')
            })
        );
    });

    it('should cap onRefreshToken at MAX_REFRESH_TOKEN_ATTEMPTS (2) then skip retry with refresh_token_max_attempts', { timeout: 15000 }, async () => {
        const logger = vi.fn();
        const onRefreshToken = vi.fn();
        const proxy = new ProxyRequest({
            logger,
            proxyConfig: getDefaultProxy({
                provider: { auth_mode: 'OAUTH2', proxy: { base_url: 'https://example.com' } },
                endpoint: '/api',
                refreshTokenOn: [401]
            }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
            onRefreshToken
        });
        vi.spyOn(proxy, 'httpCall').mockRejectedValue(createAxiosError(401));

        const res = await proxy.request();

        expect(res.isErr()).toBe(true);
        expect(onRefreshToken).toHaveBeenCalledTimes(2);
        expect(logger).toHaveBeenCalledWith(
            expect.objectContaining({
                level: 'warn',
                message: expect.stringContaining('refresh_token_max_attempts')
            })
        );
    });
});
