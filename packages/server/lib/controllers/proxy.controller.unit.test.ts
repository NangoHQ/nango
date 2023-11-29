import { expect, describe, it } from 'vitest';
import proxyController from './proxy.controller.js';
import { AuthModes } from '@nangohq/shared';

describe('Proxy Controller Construct Header Tests', () => {
    it('Should correctly construct headers for default auth', () => {
        const config = {
            template: {
                auth_mode: 'SomeOtherMode'
            },
            token: 'testtoken'
        };

        // @ts-ignore
        const result = proxyController.constructHeaders(config);

        expect(result).toEqual({
            Authorization: 'Bearer testtoken'
        });
    });

    it('Should correctly insert headers with dynamic values for oauth', () => {
        const config = {
            template: {
                auth_mode: 'OAUTH2',
                proxy: {
                    headers: {
                        'X-Access-Token': '${accessToken}'
                    }
                }
            },
            token: 'some-oauth-access-token'
        };

        // @ts-ignore
        const result = proxyController.constructHeaders(config);

        expect(result).toEqual({
            Authorization: 'Bearer some-oauth-access-token',
            'X-Access-Token': 'some-oauth-access-token'
        });
    });

    it('Should correctly merge provided headers', () => {
        const config = {
            template: {
                auth_mode: AuthModes.ApiKey,
                proxy: {
                    headers: {
                        'My-Token': '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'some-abc-token' },
            headers: {
                'x-custom-header': 'custom value',
                'y-custom-header': 'custom values'
            }
        };

        // @ts-ignore
        const result = proxyController.constructHeaders(config);

        expect(result).toEqual({
            'My-Token': 'some-abc-token',
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values'
        });
    });
});

describe('Proxy Controller Construct URL Tests', () => {
    it('Should parse headers that starts with Nango-Proxy or nango-proxy', () => {
        const req: any = {
            rawHeaders: ['Nango-Proxy-Test-Header', 'TestValue', 'nango-proxy-another-header', 'AnotherValue', 'Irrelevant-Header', 'IrrelevantValue']
        };

        // @ts-ignore
        const parsedHeaders = proxyController.parseHeaders(req);

        expect(parsedHeaders).toEqual({
            'Test-Header': 'TestValue',
            'another-header': 'AnotherValue'
        });
    });

    it('Should return an empty object when there are no Nango-Proxy or nango-proxy headers', () => {
        const req: any = {
            rawHeaders: ['Irrelevant-Header-One', 'IrrelevantValueOne', 'Irrelevant-Header-Two', 'IrrelevantValueTwo']
        };

        // @ts-ignore
        const parsedHeaders = proxyController.parseHeaders(req);

        expect(parsedHeaders).toEqual({});
    });

    it('Should handle the case when rawHeaders is not an array or empty', () => {
        const req: any = {};

        // @ts-ignore
        const parsedHeaders = proxyController.parseHeaders(req);

        expect(parsedHeaders).toEqual({});
    });
});
