import { afterEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';

import integrationService from './integration.service.js';

import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

describe('integrationService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        { name: 'all includes', includeWebhook: true, includeCredentials: true },
        { name: 'the webhook include only', includeWebhook: true, includeCredentials: false },
        { name: 'the credentials include only', includeWebhook: false, includeCredentials: true },
        { name: 'no includes', includeWebhook: false, includeCredentials: false }
    ])('gets an integration with $name', async ({ includeWebhook, includeCredentials }) => {
        const integration = integrationFixture({
            uniqueKey: 'acme:corp',
            provider: 'github',
            oauth_client_id: 'client-id',
            oauth_client_secret: 'client-secret',
            oauth_scopes: 'repo,user',
            custom: { webhookSecret: 'webhook-secret' }
        });
        const provider = providerFixture('GitHub', { webhook_routing_script: 'webhook.js' });

        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
        vi.spyOn(shared, 'getProvider').mockReturnValue(provider);

        const result = await integrationService.get({
            environmentId: 42,
            environmentUuid: 'environment-uuid',
            integrationId: 'acme:corp',
            includeWebhook,
            includeCredentials
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                integration,
                provider,
                ...(includeWebhook ? { webhookUrl: `${shared.getGlobalWebhookReceiveUrl()}/environment-uuid/acme%3Acorp` } : {}),
                ...(includeCredentials
                    ? {
                          credentials: {
                              type: 'OAUTH2',
                              clientId: 'client-id',
                              clientSecret: 'client-secret',
                              scopes: 'repo,user',
                              webhookSecret: 'webhook-secret'
                          }
                      }
                    : {})
            });
        }
    });

    it('returns a not found error when the integration does not exist', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);

        const result = await integrationService.get({
            environmentId: 42,
            environmentUuid: 'environment-uuid',
            integrationId: 'missing'
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'not_found',
                message: 'Integration "missing" does not exist'
            });
        }
    });

    it('returns a provider not found error when the integration references an unknown provider', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integrationFixture({ uniqueKey: 'missing', provider: 'missing' }));
        vi.spyOn(shared, 'getProvider').mockReturnValue(null);

        const result = await integrationService.get({
            environmentId: 42,
            environmentUuid: 'environment-uuid',
            integrationId: 'missing'
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'not_found',
                message: 'Unknown provider missing'
            });
        }
    });

    it('wraps unexpected get failures as service errors', async () => {
        const cause = new Error('database failed');
        vi.spyOn(shared.configService, 'getProviderConfig').mockRejectedValue(cause);

        const result = await integrationService.get({
            environmentId: 42,
            environmentUuid: 'environment-uuid',
            integrationId: 'github'
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'get_failed',
                message: 'Failed to get integration',
                cause
            });
        }
    });

    it('lists integrations with their providers for an environment', async () => {
        const githubIntegration = integrationFixture({ uniqueKey: 'github', provider: 'github' });
        const slackIntegration = integrationFixture({ uniqueKey: 'slack', provider: 'slack' });
        const githubProvider = providerFixture('GitHub');
        const slackProvider = providerFixture('Slack');

        vi.spyOn(shared.configService, 'listProviderConfigs').mockResolvedValue([githubIntegration, slackIntegration]);
        vi.spyOn(shared, 'getProviders').mockReturnValue({
            github: githubProvider,
            slack: slackProvider
        });

        const result = await integrationService.list({ environmentId: 42 });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual([
                { integration: githubIntegration, provider: githubProvider },
                { integration: slackIntegration, provider: slackProvider }
            ]);
        }
    });

    it('filters integrations to those allowed by a Connect Session', async () => {
        const githubIntegration = integrationFixture({ uniqueKey: 'github', provider: 'github' });
        const slackIntegration = integrationFixture({ uniqueKey: 'slack', provider: 'slack' });
        const githubProvider = providerFixture('GitHub');
        const slackProvider = providerFixture('Slack');

        vi.spyOn(shared.configService, 'listProviderConfigs').mockResolvedValue([githubIntegration, slackIntegration]);
        vi.spyOn(shared, 'getProviders').mockReturnValue({
            github: githubProvider,
            slack: slackProvider
        });

        const result = await integrationService.list({ environmentId: 42, allowedIntegrations: ['slack'] });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual([{ integration: slackIntegration, provider: slackProvider }]);
        }
    });

    it('returns an error when providers cannot be loaded', async () => {
        vi.spyOn(shared.configService, 'listProviderConfigs').mockResolvedValue([]);
        vi.spyOn(shared, 'getProviders').mockReturnValue(undefined);

        const result = await integrationService.list({ environmentId: 42 });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'list_failed',
                message: 'failed to load providers'
            });
        }
    });

    it('returns an error when an integration references a missing provider', async () => {
        vi.spyOn(shared.configService, 'listProviderConfigs').mockResolvedValue([integrationFixture({ uniqueKey: 'missing', provider: 'missing' })]);
        vi.spyOn(shared, 'getProviders').mockReturnValue({});

        const result = await integrationService.list({ environmentId: 42 });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'list_failed',
                message: 'Failed to list integrations',
                cause: new Error("Provider 'missing' does not exist")
            });
        }
    });

    it('wraps unexpected listing failures as service errors', async () => {
        const cause = new Error('database failed');
        vi.spyOn(shared.configService, 'listProviderConfigs').mockRejectedValue(cause);

        const result = await integrationService.list({ environmentId: 42 });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'list_failed',
                message: 'Failed to list integrations',
                cause
            });
        }
    });
});

function integrationFixture({ uniqueKey, provider, ...overrides }: { uniqueKey: string; provider: string } & Partial<Config>): Config {
    return {
        unique_key: uniqueKey,
        provider,
        oauth_client_id: '',
        oauth_client_secret: '',
        environment_id: 42,
        missing_fields: [],
        display_name: null,
        forward_webhooks: true,
        shared_credentials_id: null,
        created_at: createdAt,
        updated_at: updatedAt,
        ...overrides
    };
}

function providerFixture(displayName: string, overrides: { webhook_routing_script?: string } = {}): Provider {
    return {
        display_name: displayName,
        auth_mode: 'OAUTH2',
        docs: '',
        ...overrides
    };
}
