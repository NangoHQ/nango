import { expect, describe, it } from 'vitest';
import { getConnectionMetadataFromTokenResponse, parseConnectionConfigParamsFromTemplate, getAdditionalAuthorizationParams } from './utils.js';
import type { Template as ProviderTemplate } from '@nangohq/shared';
import { AuthModes } from '@nangohq/shared';

describe('Utils unit tests', () => {
    it('Should parse config params in authorization_url', () => {
        const params = parseConnectionConfigParamsFromTemplate({
            auth_mode: AuthModes.OAuth2,
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
            auth_mode: AuthModes.OAuth2,
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
            auth_mode: AuthModes.OAuth2,
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
            auth_mode: AuthModes.OAuth2,
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
            auth_mode: AuthModes.OAuth2,
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
            auth_mode: AuthModes.OAuth2,
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
            auth_mode: AuthModes.OAuth2,
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
            auth_mode: AuthModes.OAuth2,
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
            auth_mode: AuthModes.OAuth2,
            authorization_url: 'https://provider.com/oauth/authorize',
            token_url: 'https://${connectionConfig.some_domain}.com/oauth/access_token',
            token_response_metadata: ['some_domain'],
            proxy: {
                base_url: 'https://${connectionConfig.some_domain}'
            }
        });
        expect(params).toEqual(['some_domain']);
    });

    it('Should extract metadata from token response based on template', () => {
        const template: ProviderTemplate = {
            token_response_metadata: ['incoming_webhook.url', 'ok', 'bot_user_id', 'scope']
        } as ProviderTemplate;

        const params = {
            ok: true,
            scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook',
            token_type: 'bot',
            bot_user_id: 'abcd',
            enterprise: null,
            is_enterprise_install: false,
            incoming_webhook: {
                channel_id: 'foo',
                configuration_url: 'https://nangohq.slack.com',
                url: 'https://hooks.slack.com'
            }
        };

        const result = getConnectionMetadataFromTokenResponse(params, template);
        expect(result).toEqual({
            'incoming_webhook.url': 'https://hooks.slack.com',
            ok: true,
            bot_user_id: 'abcd',
            scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook'
        });
    });

    it('Should extract metadata from token response based on template and if it does not exist not fail', () => {
        const template: ProviderTemplate = {
            token_response_metadata: ['incoming_webhook.url', 'ok']
        } as ProviderTemplate;

        const params = {
            scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook',
            token_type: 'bot',
            enterprise: null,
            is_enterprise_install: false,
            incoming_webhook: {
                configuration_url: 'foo.bar'
            }
        };

        const result = getConnectionMetadataFromTokenResponse(params, template);
        expect(result).toEqual({});
    });

    it('Should not extract metadata from an empty token response', () => {
        const template: ProviderTemplate = {
            token_response_metadata: ['incoming_webhook.url', 'ok']
        } as ProviderTemplate;

        const params = {};

        const result = getConnectionMetadataFromTokenResponse(params, template);
        expect(result).toEqual({});
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
