import { afterEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import integrationService from './integration.service.js';

import type { Config } from '@nangohq/shared';
import type { DBSharedCredentials, Provider, SimplifiedJSONSchema } from '@nangohq/types';

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

    describe('create', () => {
        it('creates an integration with caller-supplied credentials and configuration', async () => {
            const provider = configurableProviderFixture();
            const createdIntegration = integrationFixture({ uniqueKey: 'github-own', provider: 'github' });
            vi.spyOn(shared, 'getProvider').mockReturnValue(provider);
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            const createSpy = vi.spyOn(shared.configService, 'createProviderConfig').mockResolvedValue(createdIntegration);

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'github',
                uniqueKey: 'github-own',
                credentialSource: 'own',
                displayName: 'GitHub Own',
                forwardWebhooks: false,
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret',
                    scopes: 'repo',
                    webhook_secret: 'webhook-secret'
                },
                integrationConfig: { region: 'us' }
            });

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toStrictEqual({ integration: createdIntegration, provider });
            }
            expect(createSpy).toHaveBeenCalledWith(
                {
                    environment_id: 42,
                    provider: 'github',
                    display_name: 'GitHub Own',
                    unique_key: 'github-own',
                    custom: { webhookSecret: 'webhook-secret', region: 'us' },
                    missing_fields: [],
                    forward_webhooks: false,
                    shared_credentials_id: null,
                    oauth_client_id: 'client-id',
                    oauth_client_secret: 'client-secret',
                    oauth_scopes: 'repo'
                },
                provider
            );
        });

        it('creates an integration with Nango-provided credentials', async () => {
            const provider = providerFixture('GitHub');
            const sharedCredentials = sharedCredentialsFixture();
            const createdIntegration = integrationFixture({ uniqueKey: 'github-nango', provider: 'github' });
            vi.spyOn(shared, 'getProvider').mockReturnValue(provider);
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            vi.spyOn(shared.sharedCredentialsService, 'getLatestSharedCredentialsByName').mockResolvedValue(Ok(sharedCredentials));
            const createSpy = vi.spyOn(shared.configService, 'createProviderConfig').mockResolvedValue(createdIntegration);

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'github',
                uniqueKey: 'github-nango',
                credentialSource: 'nango'
            });

            expect(result.isOk()).toBe(true);
            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    unique_key: 'github-nango',
                    shared_credentials_id: sharedCredentials.id,
                    forward_webhooks: true
                }),
                provider
            );
        });

        it('creates an integration with free-form custom properties', async () => {
            const provider = providerFixture('Generic', 'API_KEY');
            const createdIntegration = integrationFixture({ uniqueKey: 'generic', provider: 'generic' });
            vi.spyOn(shared, 'getProvider').mockReturnValue(provider);
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            const createSpy = vi.spyOn(shared.configService, 'createProviderConfig').mockResolvedValue(createdIntegration);

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'generic',
                uniqueKey: 'generic',
                credentialSource: 'own',
                custom: { oauth_client_name: 'My App' }
            });

            expect(result.isOk()).toBe(true);
            expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ custom: { oauth_client_name: 'My App' } }), provider);
        });

        it('rejects free-form custom properties for providers with an integration config schema', async () => {
            vi.spyOn(shared, 'getProvider').mockReturnValue(configurableProviderFixture());
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'github',
                uniqueKey: 'github',
                credentialSource: 'own',
                credentials: { type: 'OAUTH2', client_id: 'client-id', client_secret: 'client-secret' },
                custom: { region: 'us' }
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({
                    code: 'invalid_integration_config',
                    message: 'This provider uses integration_config; set its values there instead of custom'
                });
            }
        });

        it.each([
            {
                name: 'an unknown provider',
                params: { provider: 'unknown', credentialSource: 'own' as const },
                provider: null,
                error: { code: 'invalid_provider', message: 'Provider does not exist' }
            },
            {
                name: 'credentials incompatible with the provider',
                params: {
                    provider: 'github',
                    credentialSource: 'own' as const,
                    credentials: { type: 'APP' as const, app_id: 'app', app_link: 'https://example.com', private_key: 'private-key' }
                },
                provider: providerFixture('GitHub'),
                error: { code: 'incompatible_credentials', message: 'incompatible credentials auth type and provider auth' }
            },
            {
                name: 'missing required credentials',
                params: { provider: 'github', credentialSource: 'own' as const },
                provider: providerFixture('GitHub'),
                error: { code: 'missing_credentials', message: 'Missing credentials' }
            }
        ])('rejects $name', async ({ params, provider, error }) => {
            vi.spyOn(shared, 'getProvider').mockReturnValue(provider);

            const result = await integrationService.create({ environmentId: 42, uniqueKey: 'github', ...params });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject(error);
            }
        });

        it('rejects a duplicate integration ID', async () => {
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('Algolia', 'API_KEY'));
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integrationFixture({ uniqueKey: 'algolia', provider: 'algolia' }));

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'algolia',
                uniqueKey: 'algolia',
                credentialSource: 'own'
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'integration_exists', message: 'Integration already exists' });
            }
        });

        it('rejects Nango-provided credentials for an unsupported auth mode', async () => {
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('Algolia', 'API_KEY'));

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'algolia',
                uniqueKey: 'algolia',
                credentialSource: 'nango'
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({
                    code: 'nango_credentials_unsupported',
                    message: 'Nango-provided credentials are unavailable for this provider'
                });
            }
        });

        it.each([
            {
                name: 'cannot be loaded',
                sharedCredentials: Err<DBSharedCredentials | null>(new Error('database unavailable')),
                error: { code: 'shared_credentials_load_failed', message: 'Failed to load Nango-provided developer app' }
            },
            {
                name: 'are not configured',
                sharedCredentials: Ok<DBSharedCredentials | null, Error>(null),
                error: {
                    code: 'shared_credentials_not_found',
                    message: 'Nango-provided credentials are not configured for this provider'
                }
            }
        ])('returns a domain error when Nango-provided credentials $name', async ({ sharedCredentials, error }) => {
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('GitHub'));
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            vi.spyOn(shared.sharedCredentialsService, 'getLatestSharedCredentialsByName').mockResolvedValue(sharedCredentials);

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'github',
                uniqueKey: 'github',
                credentialSource: 'nango'
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject(error);
            }
        });

        it('returns a domain error for invalid integration configuration', async () => {
            vi.spyOn(shared, 'getProvider').mockReturnValue(configurableProviderFixture());
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'github',
                uniqueKey: 'github',
                credentialSource: 'own',
                credentials: { type: 'OAUTH2', client_id: 'client-id', client_secret: 'client-secret' },
                integrationConfig: { region: 'unknown' }
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'invalid_integration_config', message: 'Region must be one of: us, eu' });
            }
        });

        it('returns a domain error when persistence fails', async () => {
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('Algolia', 'API_KEY'));
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            vi.spyOn(shared.configService, 'createProviderConfig').mockResolvedValue(null);

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'algolia',
                uniqueKey: 'algolia',
                credentialSource: 'own'
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'create_failed', message: 'Failed to create integration' });
            }
        });
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

function providerFixture(displayName: string, authModeOrOverrides: Provider['auth_mode'] | { webhook_routing_script?: string } = 'OAUTH2'): Provider {
    const authMode = typeof authModeOrOverrides === 'string' ? authModeOrOverrides : 'OAUTH2';
    const overrides = typeof authModeOrOverrides === 'string' ? {} : authModeOrOverrides;
    return {
        display_name: displayName,
        auth_mode: authMode,
        docs: '',
        ...overrides
    } as Provider;
}

function configurableProviderFixture(): Provider {
    const field: SimplifiedJSONSchema = {
        type: 'string',
        title: 'Region',
        description: '',
        order: 1,
        automated: false,
        enum: ['us', 'eu']
    };
    return {
        ...providerFixture('GitHub'),
        integration_config: { region: field }
    } as Provider;
}

function sharedCredentialsFixture(): DBSharedCredentials {
    return {
        id: 12,
        name: 'github',
        credentials: {
            oauth_client_id: 'client-id',
            oauth_client_secret: 'client-secret',
            oauth_client_secret_iv: 'iv',
            oauth_client_secret_tag: 'tag'
        },
        created_at: createdAt,
        updated_at: updatedAt
    };
}
