import { describe, expect, it } from 'vitest';

import { getIntegrationCredentials } from './integrations.js';

import type { IntegrationConfig, Provider } from '@nangohq/types';

describe('getIntegrationCredentials', () => {
    it('hides credentials supplied by shared credentials', () => {
        const result = getIntegrationCredentials(
            integrationFixture({
                oauth_client_id: 'client-id',
                oauth_client_secret: 'client-secret',
                shared_credentials_id: 7
            }),
            providerFixture('OAUTH2')
        );

        expect(result).toStrictEqual({
            type: 'OAUTH2',
            clientId: '',
            clientSecret: '',
            scopes: null,
            webhookSecret: null
        });
    });

    it('decodes app private keys', () => {
        const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nprivate-key\n-----END RSA PRIVATE KEY-----';
        const result = getIntegrationCredentials(
            integrationFixture({
                oauth_client_id: 'app-id',
                oauth_client_secret: Buffer.from(privateKey).toString('base64'),
                app_link: 'https://example.com/app'
            }),
            providerFixture('APP')
        );

        expect(result).toStrictEqual({
            type: 'APP',
            appId: 'app-id',
            privateKey,
            appLink: 'https://example.com/app'
        });
    });

    it('decodes custom private keys', () => {
        const result = getIntegrationCredentials(
            integrationFixture({
                oauth_client_id: 'client-id',
                oauth_client_secret: 'client-secret',
                app_link: 'https://example.com/app',
                custom: { app_id: 'app-id', private_key: Buffer.from('private-key').toString('base64') }
            }),
            providerFixture('CUSTOM')
        );

        expect(result).toStrictEqual({
            type: 'CUSTOM',
            clientId: 'client-id',
            clientSecret: 'client-secret',
            appId: 'app-id',
            appLink: 'https://example.com/app',
            privateKey: 'private-key'
        });
    });

    it('returns null for auth modes without integration credentials', () => {
        expect(getIntegrationCredentials(integrationFixture(), providerFixture('API_KEY'))).toBeNull();
    });
});

function integrationFixture(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
    return {
        unique_key: 'github',
        provider: 'github',
        oauth_client_id: null,
        oauth_client_secret: null,
        environment_id: 42,
        missing_fields: [],
        display_name: null,
        forward_webhooks: true,
        shared_credentials_id: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
        ...overrides
    };
}

function providerFixture(authMode: Provider['auth_mode']): Provider {
    return {
        display_name: 'GitHub',
        auth_mode: authMode,
        docs: ''
    };
}
