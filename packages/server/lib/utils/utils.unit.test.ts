import { expect, describe, it } from 'vitest';
import { parseConnectionConfigParamsFromTemplate, getAdditionalAuthorizationParams } from './utils.js';

describe('Utils unit tests', () => {
    it('Should parse config params in authorization_url', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'https://api.${connectionConfig.auth}.com/oauth/authorize',
            token_url: 'n/a',
            proxy: {
                base_url: 'https://api.domain.com'
            }
        });
        expect(params).toEqual(['auth']);
    });
    it('Should parse config params in token_url', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'n/a',
            token_url: 'https://api.${connectionConfig.token}.com/oauth/access_token',
            proxy: {
                base_url: 'https://api.domain.com'
            }
        });
        expect(params).toEqual(['token']);
    });

    it('Should parse config params in proxy_url', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'n/a',
            token_url: 'n/a',
            proxy: {
                base_url: 'https://${connectionConfig.subdomain}.freshdesk.com'
            }
        });
        expect(params).toEqual(['subdomain']);
    });
    it('Should ignore config param in proxy.base_url if in redirect_uri_metadata', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'n/a',
            token_url: 'n/a',
            redirect_uri_metadata: ['instance_url'],
            proxy: {
                base_url: '${connectionConfig.instance_url}'
            }
        });
        expect(params).toEqual([]);
    });
    it('Should ignore config param in proxy.base_url if in token_response_metadata', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'n/a',
            token_url: 'n/a',
            token_response_metadata: ['api_domain'],
            proxy: {
                base_url: 'https://${connectionConfig.api_domain}'
            }
        });
        expect(params).toEqual([]);
    });
    it('Should ignore config param in proxy.headers if in redirect_uri_metadata', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'n/a',
            token_url: 'n/a',
            redirect_uri_metadata: ['some_header'],
            proxy: {
                headers: {
                    'X-Some-Header': '${connectionConfig.some_header}'
                },
                base_url: 'n/a'
            }
        });
        expect(params).toEqual([]);
    });
    it('Should ignore config param in proxy.headers if in token_response_metadata', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'n/a',
            token_url: 'n/a',
            token_response_metadata: ['another_header'],
            proxy: {
                headers: {
                    'X-Another-Header': '${connectionConfig.another_header}'
                },
                base_url: 'n/a'
            }
        });
        expect(params).toEqual([]);
    });
    it('Should not ignore param in token_response_metadata if also in authorization_url', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'https://${connectionConfig.provider_domain}.com/oauth/authorize',
            token_url: 'n/a',
            token_response_metadata: ['provider_domain'],
            proxy: {
                base_url: 'https://${connectionConfig.provider_domain}'
            }
        });
        expect(params).toEqual(['provider_domain']);
    });
    it('Should not ignore param in token_response_metadata if also in token_url', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            display_name: 'test',
            docs: '',
            auth_mode: 'OAUTH2',
            authorization_url: 'https://provider.com/oauth/authorize',
            token_url: 'https://${connectionConfig.some_domain}.com/oauth/access_token',
            token_response_metadata: ['some_domain'],
            proxy: {
                base_url: 'https://${connectionConfig.some_domain}'
            }
        });
        expect(params).toEqual(['some_domain']);
    });

    it('Should return additional authorization params with string values only and preserve undefined values', () => {
        const params = {
            key1: 'value1',
            key2: 123,
            key3: true,
            key4: 'undefined',
            key5: 'value5'
        };

        const result = getAdditionalAuthorizationParams(params);
        expect(result).toEqual({
            key1: 'value1',
            key4: undefined,
            key5: 'value5'
        });
    });

    it('Should return an empty object when no string values are present', () => {
        const params = {
            key1: 123,
            key2: true
        };

        const result = getAdditionalAuthorizationParams(params);
        expect(result).toEqual({});
    });

    it('Should handle an empty params object', () => {
        const params = {};

        const result = getAdditionalAuthorizationParams(params);
        expect(result).toEqual({});
    });

    it('Should handle an non-object param', () => {
        const params = "I'm not an object";

        const result = getAdditionalAuthorizationParams(params);
        expect(result).toEqual({});
    });

    it('Should handle a null & undefined param', () => {
        let result = getAdditionalAuthorizationParams(null);
        expect(result).toEqual({});
        result = getAdditionalAuthorizationParams(undefined);
        expect(result).toEqual({});
    });
});
