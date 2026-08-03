import { describe, expect, it } from 'vitest';

import { getProvider } from '@nangohq/shared';

import { integrationToMcp } from './formatter.js';

import type { IntegrationConfig } from '@nangohq/types';

describe('integrationToMcp', () => {
    it('lists credentials preconfigured on a two-step integration', () => {
        const provider = getProvider('sage-intacct-cc');
        if (!provider) {
            throw new Error('Expected sage-intacct-cc provider');
        }
        const integration = integrationFixture({
            provider: 'sage-intacct-cc',
            custom: { clientId: 'client-id', clientSecret: 'client-secret' }
        });

        const result = integrationToMcp({ integration, provider });

        expect(result.preconfigured_credentials).toStrictEqual(['clientId', 'clientSecret']);
    });

    it('uses an integration-specific API key label', () => {
        const provider = getProvider('private-api-generic');
        if (!provider) {
            throw new Error('Expected private-api-generic provider');
        }
        const integration = integrationFixture({
            provider: 'private-api-generic',
            custom: { keyLabel: 'Workspace token' }
        });

        const result = integrationToMcp({ integration, provider });

        expect(result.credentials_label).toStrictEqual({ apiKey: 'Workspace token' });
    });

    it('formats explicitly requested domain includes for the MCP transport', () => {
        const provider = getProvider('github');
        if (!provider) {
            throw new Error('Expected github provider');
        }
        const integration = integrationFixture({ provider: 'github', custom: null });

        const result = integrationToMcp({
            integration,
            provider,
            webhookUrl: 'https://example.com/webhook',
            credentials: {
                type: 'OAUTH2',
                clientId: 'client-id',
                clientSecret: 'client-secret',
                scopes: 'repo,user',
                webhookSecret: 'webhook-secret'
            }
        });

        expect(result).toMatchObject({
            webhook_url: 'https://example.com/webhook',
            credentials: {
                type: 'OAUTH2',
                client_id: 'client-id',
                client_secret: 'client-secret',
                scopes: 'repo,user',
                webhook_secret: 'webhook-secret'
            }
        });
    });
});

function integrationFixture({ provider, custom }: { provider: string; custom: IntegrationConfig['custom'] }): IntegrationConfig {
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
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z')
    };
}
