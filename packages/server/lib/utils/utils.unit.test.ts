import { expect, describe, it } from 'vitest';
import { getConnectionMetadataFromTokenResponse, parseConnectionConfigParamsFromTemplate } from './utils.js';
import type { Template as ProviderTemplate } from '@nangohq/shared';

describe('Utils unit tests', () => {
    it('Should parse template connection config params', () => {
        const proxyTemplate = {
            name: 'braintree',
            provider: 'braintree',
            proxy: {
                base_url: 'https://api.${connectionConfig.subdomain}.com'
            }
        };

        const connectionConfigProxy = parseConnectionConfigParamsFromTemplate(proxyTemplate as unknown as ProviderTemplate);
        expect(connectionConfigProxy).toEqual(['subdomain']);

        const authTemplate = {
            name: 'braintree',
            provider: 'braintree',
            authorization_url: 'https://api.${connectionConfig.auth}.com/oauth/authorize'
        };

        const connectionConfigAuth = parseConnectionConfigParamsFromTemplate(authTemplate as unknown as ProviderTemplate);
        expect(connectionConfigAuth).toEqual(['auth']);

        const tokenTemplate = {
            name: 'braintree',
            provider: 'braintree',
            token_url: 'https://api.${connectionConfig.token}.com/oauth/access_token'
        };

        const connectionConfigToken = parseConnectionConfigParamsFromTemplate(tokenTemplate as unknown as ProviderTemplate);
        expect(connectionConfigToken).toEqual(['token']);
    });

    it('Should extract metadata from token response based on template', () => {
        const template: ProviderTemplate = {
            token_response_metadata: ['incoming_webhook.url', 'ok', 'bot_user_id', 'scope']
        } as ProviderTemplate;

        const params = {
            ok: true,
            app_id: 'A03MTRVRNHM',
            scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook',
            token_type: 'bot',
            bot_user_id: 'U03NAA9Q77D',
            enterprise: null,
            is_enterprise_install: false,
            incoming_webhook: {
                channel_id: 'D055NBEBGHH',
                configuration_url: 'https://nangohq.slack.com/services/B05TVQV8ARE',
                url: 'https://hooks.slack.com/services/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'
            }
        };

        const result = getConnectionMetadataFromTokenResponse(params, template);
        expect(result).toEqual({
            'incoming_webhook.url': 'https://hooks.slack.com/services/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',
            ok: true,
            bot_user_id: 'U03NAA9Q77D',
            scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook'
        });
    });

    it('Should extract metadata from token response based on template and if it does not exist not fail', () => {
        const template: ProviderTemplate = {
            token_response_metadata: ['incoming_webhook.url', 'ok']
        } as ProviderTemplate;

        const params = {
            app_id: 'A03MTRVRNHM',
            authed_user: { id: 'U056C66B8L8' },
            scope: 'chat:write,channels:read,team.billing:read,users:read,channels:history,channels:join,incoming-webhook',
            token_type: 'bot',
            access_token: 'xoxb-2710526930471-3758349823251-vY07FoRfczmorznPfEiqt88x',
            bot_user_id: 'U03NAA9Q77D',
            team: { id: 'T02LWFGTCDV', name: 'Nango' },
            enterprise: null,
            is_enterprise_install: false,
            incoming_webhook: {
                configuration_url: 'https://nangohq.slack.com/services/B05TVQV8ARE'
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
});
