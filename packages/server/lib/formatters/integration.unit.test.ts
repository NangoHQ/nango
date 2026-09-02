import { describe, expect, it } from 'vitest';

import { getProvider } from '@nangohq/shared';

import { integrationCredentialsToPublicApi, integrationToApi, integrationToPublicApi } from './integration.js';

import type { IntegrationConfig } from '@nangohq/types';

function makeIntegration(custom: IntegrationConfig['custom'], provider = 'sage-intacct-cc'): IntegrationConfig {
    return {
        unique_key: provider,
        provider,
        oauth_client_id: null,
        oauth_client_secret: null,
        environment_id: 1,
        custom,
        missing_fields: [],
        display_name: null,
        forward_webhooks: true,
        shared_credentials_id: null,
        created_at: new Date('2025-01-01'),
        updated_at: new Date('2025-01-01')
    };
}

// Load the real provider definition (not a hand-rolled fixture) so this test fails if `clientId`/`clientSecret`
// are ever removed from `sage-intacct-cc`'s `integration_config` block, or if `auth_mode` ever stops being
// TWO_STEP — either would silently break the Connect UI's "ask only if not preconfigured" fallback.
const provider = getProvider('sage-intacct-cc')!;

describe('integrationToPublicApi preconfigured_credentials', () => {
    it('lists credential fields already set at the integration level', () => {
        const result = integrationToPublicApi({ integration: makeIntegration({ clientId: 'abc', clientSecret: 'shh' }), provider });

        expect(result.preconfigured_credentials).toStrictEqual(['clientId', 'clientSecret']);
    });

    it('omits fields with no value set on the integration', () => {
        const result = integrationToPublicApi({ integration: makeIntegration({ clientId: 'abc' }), provider });

        expect(result.preconfigured_credentials).toStrictEqual(['clientId']);
    });

    it('is absent when the integration has no custom config', () => {
        const result = integrationToPublicApi({ integration: makeIntegration(null), provider });

        expect(result.preconfigured_credentials).toBeUndefined();
    });

    it('never includes fields only declared in credentials, not integration_config', () => {
        const result = integrationToPublicApi({ integration: makeIntegration({ username: 'bob' }), provider });

        expect(result.preconfigured_credentials).toBeUndefined();
    });
});

// Load the real provider definition so this test fails if `appDomain` ever stops being declared in both
// `integration_config` and `connection_config` — that dual declaration is what the fallback relies on.
const stripeAppSandboxProvider = getProvider('stripe-app-sandbox')!;

describe('integrationToPublicApi preconfigured_connection_config', () => {
    it('lists connection_config fields already set at the integration level', () => {
        const result = integrationToPublicApi({
            integration: makeIntegration({ appDomain: 'ca_123' }, 'stripe-app-sandbox'),
            provider: stripeAppSandboxProvider
        });

        expect(result.preconfigured_connection_config).toStrictEqual(['appDomain']);
    });

    it('is absent when the integration has no custom config', () => {
        const result = integrationToPublicApi({ integration: makeIntegration(null, 'stripe-app-sandbox'), provider: stripeAppSandboxProvider });

        expect(result.preconfigured_connection_config).toBeUndefined();
    });

    it('is absent when the field is not set on the integration', () => {
        const result = integrationToPublicApi({ integration: makeIntegration({}, 'stripe-app-sandbox'), provider: stripeAppSandboxProvider });

        expect(result.preconfigured_connection_config).toBeUndefined();
    });
});

describe('integrationToApi', () => {
    it('hides oauth_client_id/secret/app_link and the rest of custom for shared credentials', () => {
        const integration: IntegrationConfig = {
            ...makeIntegration({ clientId: 'abc', clientSecret: 'shh' }),
            oauth_client_id: 'nango-shared-client-id',
            oauth_client_secret: 'nango-shared-secret',
            app_link: 'https://example.com/nango-app',
            shared_credentials_id: 42
        };

        const result = integrationToApi(integration);

        expect(result.oauth_client_id).toBe('');
        expect(result.oauth_client_secret).toBe('');
        expect(result.app_link).toBeNull();
        expect(result.custom).toBeNull();
    });

    it('keeps webhookSecret visible for shared credentials, since it is independent of the OAuth app', () => {
        const integration: IntegrationConfig = {
            ...makeIntegration({ clientId: 'abc', webhookSecret: 'whsec_123' }),
            shared_credentials_id: 42
        };

        const result = integrationToApi(integration);

        expect(result.custom).toStrictEqual({ webhookSecret: 'whsec_123' });
    });

    it('hides free-form custom for shared credentials even without an integration_config schema to mask against', () => {
        const integration: IntegrationConfig = {
            ...makeIntegration({ private_key: 'super-secret-key', password: 'hunter2' }, 'github'),
            shared_credentials_id: 42
        };

        const result = integrationToApi(integration);

        expect(result.custom).toBeNull();
    });

    it('shows everything when credentials are not shared', () => {
        const integration: IntegrationConfig = {
            ...makeIntegration({ clientId: 'abc' }),
            oauth_client_id: 'my-client-id',
            oauth_client_secret: 'my-secret',
            shared_credentials_id: null
        };

        const result = integrationToApi(integration);

        expect(result.oauth_client_id).toBe('my-client-id');
        expect(result.oauth_client_secret).toBe('my-secret');
        expect(result.custom).toStrictEqual({ clientId: 'abc' });
    });

    it('hides custom entirely for a caller without canReadProdConnectionCredentials, even with a webhookSecret and no shared credentials', () => {
        const integration: IntegrationConfig = {
            ...makeIntegration({ clientId: 'abc', webhookSecret: 'whsec_123' }),
            oauth_client_id: 'my-client-id',
            oauth_client_secret: 'my-secret',
            shared_credentials_id: null
        };

        const result = integrationToApi(integration, { includeCredentials: false });

        expect(result.oauth_client_id).toBe('');
        expect(result.oauth_client_secret).toBe('');
        expect(result.custom).toBeNull();
    });

    it('hides webhookSecret too when a caller lacks canReadProdConnectionCredentials on a shared-credentials integration', () => {
        const integration: IntegrationConfig = {
            ...makeIntegration({ clientId: 'abc', webhookSecret: 'whsec_123' }),
            shared_credentials_id: 42
        };

        const result = integrationToApi(integration, { includeCredentials: false });

        expect(result.custom).toBeNull();
    });
});

describe('integrationCredentialsToPublicApi', () => {
    it('formats domain credentials for the public API transport', () => {
        const result = integrationCredentialsToPublicApi({
            type: 'CUSTOM',
            clientId: 'client-id',
            clientSecret: 'client-secret',
            appId: 'app-id',
            appLink: 'https://example.com/app',
            privateKey: 'private-key'
        });

        expect(result).toStrictEqual({
            type: 'CUSTOM',
            client_id: 'client-id',
            client_secret: 'client-secret',
            app_id: 'app-id',
            app_link: 'https://example.com/app',
            private_key: 'private-key'
        });
    });
});
