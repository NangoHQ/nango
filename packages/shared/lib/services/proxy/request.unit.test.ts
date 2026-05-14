import { describe, expect, it, vi } from 'vitest';

import { ProxyRequest } from './request.js';
import { getDefaultProxy } from './utils.test.js';
import { getTestConnection } from '../../seeders/connection.seeder.js';

describe('call', () => {
    it('should make a single successful http call', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/200' }),
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null, custom: null })
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
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null, custom: null })
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
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null, custom: null })
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

    it('should redact rendered generic API key auth values in logs', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({
                provider: {
                    auth_mode: 'API_KEY',
                    proxy: {
                        base_url: 'https://api.example.com',
                        auth: {
                            type: 'api_key',
                            placement: '${integrationConfig.custom.generic_api_key_placement}',
                            name: '${integrationConfig.custom.generic_api_key_name}',
                            value_template: '${integrationConfig.custom.generic_api_key_value_template}'
                        }
                    }
                },
                endpoint: '/test'
            }),
            getConnection: () =>
                getTestConnection({
                    credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' }
                }),
            getIntegrationConfig: () => ({
                oauth_client_id: null,
                oauth_client_secret: null,
                custom: {
                    generic_api_key_placement: 'header',
                    generic_api_key_name: 'Authorization',
                    generic_api_key_value_template: 'Bearer {apiKey}'
                }
            })
        });
        proxy.httpCall = vi.fn().mockResolvedValue({ status: 200, headers: {} });

        (await proxy.request()).unwrap();

        expect(fn).toHaveBeenCalledWith(
            expect.objectContaining({
                request: {
                    method: 'GET',
                    url: 'https://api.example.com/test',
                    headers: { authorization: 'REDACTED' }
                }
            })
        );
    });

    it('should redact encoded generic API key query auth values in logs', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({
                provider: {
                    auth_mode: 'API_KEY',
                    proxy: {
                        base_url: 'https://api.example.com',
                        auth: {
                            type: 'api_key',
                            placement: '${integrationConfig.custom.generic_api_key_placement}',
                            name: '${integrationConfig.custom.generic_api_key_name}',
                            value_template: '${integrationConfig.custom.generic_api_key_value_template}'
                        }
                    }
                },
                endpoint: '/test'
            }),
            getConnection: () =>
                getTestConnection({
                    credentials: { type: 'API_KEY', apiKey: 'sweet secret+token/value=' }
                }),
            getIntegrationConfig: () => ({
                oauth_client_id: null,
                oauth_client_secret: null,
                custom: {
                    generic_api_key_placement: 'query',
                    generic_api_key_name: 'api_key',
                    generic_api_key_value_template: '{apiKey}'
                }
            })
        });
        proxy.httpCall = vi.fn().mockResolvedValue({ status: 200, headers: {} });

        (await proxy.request()).unwrap();

        expect(fn).toHaveBeenCalledWith(
            expect.objectContaining({
                request: {
                    method: 'GET',
                    url: 'https://api.example.com/test?api_key=REDACTED',
                    headers: {}
                }
            })
        );
    });
});
