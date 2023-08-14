import { expect, describe, it } from 'vitest';
import { parseConnectionConfigParamsFromTemplate } from './utils.js';
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
});
