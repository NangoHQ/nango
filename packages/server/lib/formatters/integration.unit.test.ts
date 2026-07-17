import { describe, expect, it } from 'vitest';

import { getProvider } from '@nangohq/shared';

import { integrationToPublicApi } from './integration.js';

import type { IntegrationConfig } from '@nangohq/types';

function makeIntegration(custom: IntegrationConfig['custom']): IntegrationConfig {
    return {
        unique_key: 'sage-intacct-cc',
        provider: 'sage-intacct-cc',
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
