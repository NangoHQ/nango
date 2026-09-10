import { afterEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import integrationService, { IntegrationService } from './integration.service.js';

import type { Config, Orchestrator } from '@nangohq/shared';
import type { DBEnvironment, DBSharedCredentials, DBTeam, Provider, SimplifiedJSONSchema } from '@nangohq/types';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');
const environmentFixture = { id: 42, uuid: 'environment-uuid', callback_url: null, name: 'dev' } as DBEnvironment;
const teamFixture = { id: 1, name: 'Acme' } as DBTeam;

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

        it('creates an integration with Nango-provided credentials for an APP-mode provider', async () => {
            const provider = providerFixture('GitHub App', 'APP');
            const sharedCredentials = sharedCredentialsFixture({ app_link: 'https://github.com/apps/some-shared-app' });
            const createdIntegration = integrationFixture({ uniqueKey: 'github-app-nango', provider: 'github-app' });
            vi.spyOn(shared, 'getProvider').mockReturnValue(provider);
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            vi.spyOn(shared.sharedCredentialsService, 'getLatestSharedCredentialsByName').mockResolvedValue(Ok(sharedCredentials));
            const createSpy = vi.spyOn(shared.configService, 'createProviderConfig').mockResolvedValue(createdIntegration);

            const result = await integrationService.create({
                environmentId: 42,
                provider: 'github-app',
                uniqueKey: 'github-app-nango',
                credentialSource: 'nango'
            });

            expect(result.isOk()).toBe(true);
            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    unique_key: 'github-app-nango',
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
            const service = new IntegrationService({ error: vi.fn() });
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('GitHub'));
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            vi.spyOn(shared.sharedCredentialsService, 'getLatestSharedCredentialsByName').mockResolvedValue(sharedCredentials);

            const result = await service.create({
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

        it('logs shared credential load failures without error messages or request data', async () => {
            const errorSpy = vi.fn();
            const service = new IntegrationService({ error: errorSpy });
            const databaseError = Object.assign(new Error('customer@example.com client-secret'), {
                code: 'ECONNRESET',
                query: 'select customer@example.com',
                bindings: ['client-secret']
            });
            const wrappedError = new Error('failed_to_get_shared_credentials_by_name', { cause: databaseError });
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('GitHub'));
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            vi.spyOn(shared.sharedCredentialsService, 'getLatestSharedCredentialsByName').mockResolvedValue(Err(wrappedError));

            await service.create({
                environmentId: 42,
                provider: 'github',
                uniqueKey: 'customer@example.com',
                credentialSource: 'nango'
            });

            expect(errorSpy).toHaveBeenCalledWith('Integration creation failed', {
                failureCode: 'shared_credentials_load_failed',
                errorKind: 'exception',
                machineErrorCode: 'ECONNRESET'
            });
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
            const errorSpy = vi.fn();
            const service = new IntegrationService({ error: errorSpy });
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('Algolia', 'API_KEY'));
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            vi.spyOn(shared.configService, 'createProviderConfig').mockResolvedValue(null);

            const result = await service.create({
                environmentId: 42,
                provider: 'algolia',
                uniqueKey: 'algolia',
                credentialSource: 'own'
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'create_failed', message: 'Failed to create integration' });
            }
            expect(errorSpy).toHaveBeenCalledWith('Integration creation failed', {
                failureCode: 'create_failed',
                errorKind: 'empty_result'
            });
        });

        it('logs unexpected creation failures without error messages or request data', async () => {
            const errorSpy = vi.fn();
            const service = new IntegrationService({ error: errorSpy });
            const databaseError = Object.assign(new Error('customer@example.com client-secret'), {
                code: '23505',
                detail: 'customer@example.com client-secret'
            });
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('Algolia', 'API_KEY'));
            vi.spyOn(shared.configService, 'getProviderConfig').mockRejectedValue(databaseError);

            await service.create({
                environmentId: 42,
                provider: 'algolia',
                uniqueKey: 'customer@example.com',
                credentialSource: 'own'
            });

            expect(errorSpy).toHaveBeenCalledWith('Integration creation failed', {
                failureCode: 'create_failed',
                errorKind: 'exception',
                machineErrorCode: '23505'
            });
        });

        describe('MCP_OAUTH2', () => {
            it('dynamically registers a client and stores the returned credentials', async () => {
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('dynamic'));
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
                const registerSpy = vi
                    .spyOn(shared.mcpClient, 'registerClientId')
                    .mockResolvedValue({ client_id: 'dcr-client-id', client_secret: 'dcr-secret' });
                const createSpy = vi
                    .spyOn(shared.configService, 'createProviderConfig')
                    .mockResolvedValue(integrationFixture({ uniqueKey: 'mcp1', provider: 'mcp1' }));

                const result = await integrationService.create({
                    environmentId: 42,
                    provider: 'mcp1',
                    uniqueKey: 'mcp1',
                    credentialSource: 'own',
                    environment: environmentFixture,
                    team: teamFixture
                });

                expect(result.isOk()).toBe(true);
                expect(registerSpy).toHaveBeenCalledWith({ provider: mcpProviderFixture('dynamic'), environment: environmentFixture, team: teamFixture });
                expect(createSpy).toHaveBeenCalledWith(
                    expect.objectContaining({ oauth_client_id: 'dcr-client-id', oauth_client_secret: 'dcr-secret' }),
                    mcpProviderFixture('dynamic')
                );
            });

            it('takes user-supplied credentials for static client registration', async () => {
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('static'));
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
                const createSpy = vi
                    .spyOn(shared.configService, 'createProviderConfig')
                    .mockResolvedValue(integrationFixture({ uniqueKey: 'mcp2', provider: 'mcp2' }));

                const result = await integrationService.create({
                    environmentId: 42,
                    provider: 'mcp2',
                    uniqueKey: 'mcp2',
                    credentialSource: 'own',
                    credentials: { type: 'MCP_OAUTH2', client_id: 'my-client-id', client_secret: 'my-secret' },
                    environment: environmentFixture,
                    team: teamFixture
                });

                expect(result.isOk()).toBe(true);
                expect(createSpy).toHaveBeenCalledWith(
                    expect.objectContaining({ oauth_client_id: 'my-client-id', oauth_client_secret: 'my-secret' }),
                    mcpProviderFixture('static')
                );
            });

            it('normalizes space-delimited scopes to comma-delimited storage', async () => {
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('static'));
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
                const createSpy = vi
                    .spyOn(shared.configService, 'createProviderConfig')
                    .mockResolvedValue(integrationFixture({ uniqueKey: 'mcp2', provider: 'mcp2' }));

                const result = await integrationService.create({
                    environmentId: 42,
                    provider: 'mcp2',
                    uniqueKey: 'mcp2',
                    credentialSource: 'own',
                    credentials: { type: 'MCP_OAUTH2', client_id: 'my-client-id', client_secret: 'my-secret', scopes: 'read write offline_access' },
                    environment: environmentFixture,
                    team: teamFixture
                });

                expect(result.isOk()).toBe(true);
                expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ oauth_scopes: 'read,write,offline_access' }), mcpProviderFixture('static'));
            });

            it('rejects creating a static integration with no credentials', async () => {
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('static'));
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
                const createSpy = vi.spyOn(shared.configService, 'createProviderConfig');

                const result = await integrationService.create({
                    environmentId: 42,
                    provider: 'mcp2',
                    uniqueKey: 'mcp2',
                    credentialSource: 'own',
                    environment: environmentFixture,
                    team: teamFixture
                });

                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error).toMatchObject({ code: 'missing_credentials' });
                }
                expect(createSpy).not.toHaveBeenCalled();
            });

            it('rejects creating a static integration with only a client_id and no client_secret', async () => {
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('static'));
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
                const createSpy = vi.spyOn(shared.configService, 'createProviderConfig');

                const result = await integrationService.create({
                    environmentId: 42,
                    provider: 'mcp2',
                    uniqueKey: 'mcp2',
                    credentialSource: 'own',
                    credentials: { type: 'MCP_OAUTH2', client_id: 'my-client-id' },
                    environment: environmentFixture,
                    team: teamFixture
                });

                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error).toMatchObject({ code: 'missing_credentials' });
                }
                expect(createSpy).not.toHaveBeenCalled();
            });

            it('rejects creating a dynamic integration with caller-supplied client_id/secret instead of silently discarding them', async () => {
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('dynamic'));
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
                const registerSpy = vi.spyOn(shared.mcpClient, 'registerClientId');
                const createSpy = vi.spyOn(shared.configService, 'createProviderConfig');

                const result = await integrationService.create({
                    environmentId: 42,
                    provider: 'mcp1',
                    uniqueKey: 'mcp1',
                    credentialSource: 'own',
                    credentials: { type: 'MCP_OAUTH2', client_id: 'attacker-supplied' },
                    environment: environmentFixture,
                    team: teamFixture
                });

                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error).toMatchObject({ code: 'incompatible_credentials' });
                }
                expect(registerSpy).not.toHaveBeenCalled();
                expect(createSpy).not.toHaveBeenCalled();
            });

            it('registers a CIMD client_id when Nango is reachable over HTTPS', async () => {
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('cimd'));
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
                vi.spyOn(shared, 'getGlobalClientMetadataDocumentUrl').mockImplementation(
                    (environmentUuid, providerConfigKey) => `https://nango.example.com/oauth/client-metadata/${environmentUuid}/${providerConfigKey}`
                );
                const createSpy = vi
                    .spyOn(shared.configService, 'createProviderConfig')
                    .mockResolvedValue(integrationFixture({ uniqueKey: 'mcp3', provider: 'mcp3' }));

                const result = await integrationService.create({
                    environmentId: 42,
                    provider: 'mcp3',
                    uniqueKey: 'mcp3',
                    credentialSource: 'own',
                    environment: environmentFixture,
                    team: teamFixture
                });

                expect(result.isOk()).toBe(true);
                expect(createSpy).toHaveBeenCalledWith(
                    expect.objectContaining({ oauth_client_id: 'https://nango.example.com/oauth/client-metadata/environment-uuid/mcp3' }),
                    mcpProviderFixture('cimd')
                );
            });

            it('rejects creating a CIMD integration when Nango is not reachable over HTTPS', async () => {
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('cimd'));
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
                vi.spyOn(shared, 'getGlobalClientMetadataDocumentUrl').mockReturnValue(null);
                const createSpy = vi.spyOn(shared.configService, 'createProviderConfig');

                const result = await integrationService.create({
                    environmentId: 42,
                    provider: 'mcp3',
                    uniqueKey: 'mcp3',
                    credentialSource: 'own',
                    environment: environmentFixture,
                    team: teamFixture
                });

                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error).toMatchObject({ code: 'invalid_integration_config' });
                }
                expect(createSpy).not.toHaveBeenCalled();
            });
        });
    });

    describe('update', () => {
        it('updates integration domain fields, credentials, and validated configuration', async () => {
            const integration = integrationFixture({ uniqueKey: 'github', provider: 'github', custom: { existing: 'value' } });
            const provider = configurableProviderFixture();
            const updatedIntegration = integrationFixture({ uniqueKey: 'github-renamed', provider: 'github' });
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
            vi.spyOn(shared, 'getProvider').mockReturnValue(provider);
            vi.spyOn(shared.configService, 'getIdByProviderConfigKey').mockResolvedValue(null);
            vi.spyOn(shared.connectionService, 'countConnections').mockResolvedValue(0);
            const editSpy = vi.spyOn(shared.configService, 'editProviderConfig').mockResolvedValue(updatedIntegration as never);

            const result = await integrationService.update({
                environmentId: 42,
                integrationId: 'github',
                newIntegrationId: 'github-renamed',
                displayName: 'GitHub Renamed',
                forwardWebhooks: false,
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'new-client-id',
                    client_secret: 'new-client-secret',
                    scopes: 'repo',
                    webhook_secret: 'new-webhook-secret'
                },
                integrationConfig: { region: 'eu' }
            });

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toStrictEqual({ integration: updatedIntegration, provider });
            }
            expect(editSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    unique_key: 'github-renamed',
                    display_name: 'GitHub Renamed',
                    forward_webhooks: false,
                    oauth_client_id: 'new-client-id',
                    oauth_client_secret: 'new-client-secret',
                    oauth_scopes: 'repo',
                    custom: { existing: 'value', region: 'eu', webhookSecret: 'new-webhook-secret' }
                }),
                provider
            );
        });

        it('updates free-form custom values for providers without an integration config schema', async () => {
            const integration = integrationFixture({ uniqueKey: 'algolia', provider: 'algolia', custom: { existing: 'value' } });
            const provider = providerFixture('Algolia', 'API_KEY');
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
            vi.spyOn(shared, 'getProvider').mockReturnValue(provider);
            const editSpy = vi.spyOn(shared.configService, 'editProviderConfig').mockResolvedValue(integration as never);

            await integrationService.update({
                environmentId: 42,
                integrationId: 'algolia',
                custom: { region: 'eu' }
            });

            expect(editSpy).toHaveBeenCalledWith(expect.objectContaining({ custom: { existing: 'value', region: 'eu' } }), provider);
        });

        it('rejects credentials incompatible with the provider auth mode', async () => {
            const integration = integrationFixture({ uniqueKey: 'github', provider: 'github' });
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('GitHub'));
            const editSpy = vi.spyOn(shared.configService, 'editProviderConfig');

            const result = await integrationService.update({
                environmentId: 42,
                integrationId: 'github',
                credentials: { type: 'APP', app_id: 'app-id', app_link: 'https://example.com', private_key: 'private-key' }
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'incompatible_credentials', message: 'incompatible credentials auth type and provider auth' });
            }
            expect(editSpy).not.toHaveBeenCalled();
        });

        it('removes a stored webhook secret when it is cleared', async () => {
            const integration = integrationFixture({
                uniqueKey: 'github',
                provider: 'github',
                custom: { existing: 'value', webhookSecret: 'old-webhook-secret' }
            });
            const provider = providerFixture('GitHub');
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
            vi.spyOn(shared, 'getProvider').mockReturnValue(provider);
            const editSpy = vi.spyOn(shared.configService, 'editProviderConfig').mockResolvedValue(integration as never);

            const result = await integrationService.update({
                environmentId: 42,
                integrationId: 'github',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret',
                    webhook_secret: ''
                }
            });

            expect(result.isOk()).toBe(true);
            expect(editSpy).toHaveBeenCalledWith(expect.objectContaining({ custom: { existing: 'value' } }), provider);
        });

        it('rejects a replacement integration ID already used by another integration', async () => {
            const integration = integrationFixture({ uniqueKey: 'github', provider: 'github', id: 1 });
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('GitHub'));
            vi.spyOn(shared.configService, 'getIdByProviderConfigKey').mockResolvedValue(2);

            const result = await integrationService.update({ environmentId: 42, integrationId: 'github', newIntegrationId: 'existing' });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'integration_exists' });
            }
        });

        it('rejects renaming an integration with active connections', async () => {
            const integration = integrationFixture({ uniqueKey: 'github', provider: 'github' });
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('GitHub'));
            vi.spyOn(shared.configService, 'getIdByProviderConfigKey').mockResolvedValue(null);
            vi.spyOn(shared.connectionService, 'countConnections').mockResolvedValue(1);

            const result = await integrationService.update({ environmentId: 42, integrationId: 'github', newIntegrationId: 'renamed' });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'integration_has_connections' });
            }
        });

        it('returns transport-neutral errors for missing integrations and invalid custom values', async () => {
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValueOnce(null);
            const missing = await integrationService.update({ environmentId: 42, integrationId: 'missing' });
            expect(missing.isErr() && missing.error.code).toBe('not_found');

            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValueOnce(integrationFixture({ uniqueKey: 'github', provider: 'github' }));
            vi.spyOn(shared, 'getProvider').mockReturnValue(configurableProviderFixture());
            const invalid = await integrationService.update({ environmentId: 42, integrationId: 'github', custom: { region: 'us' } });
            expect(invalid.isErr() && invalid.error.code).toBe('custom_not_allowed');
        });

        it('logs unexpected update failures without error messages or request data', async () => {
            const errorSpy = vi.fn();
            const service = new IntegrationService({ error: errorSpy });
            const databaseError = Object.assign(new Error('customer@example.com client-secret'), {
                code: '23505',
                detail: 'customer@example.com client-secret'
            });
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integrationFixture({ uniqueKey: 'github', provider: 'github' }));
            vi.spyOn(shared, 'getProvider').mockReturnValue(providerFixture('GitHub'));
            vi.spyOn(shared.configService, 'editProviderConfig').mockRejectedValue(databaseError);

            const result = await service.update({
                environmentId: 42,
                integrationId: 'customer@example.com',
                credentials: { type: 'OAUTH2', client_id: 'client-id-secret', client_secret: 'client-secret' }
            });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'update_failed', message: 'Failed to update integration', cause: databaseError });
            }
            expect(errorSpy).toHaveBeenCalledWith('Integration update failed', {
                failureCode: 'update_failed',
                errorKind: 'exception',
                machineErrorCode: '23505'
            });
        });

        describe('MCP_OAUTH2', () => {
            it('updates non-credential fields for a dynamically registered integration without touching its client_id/secret', async () => {
                const integration = integrationFixture({
                    uniqueKey: 'mcp1',
                    provider: 'mcp1',
                    oauth_client_id: 'dcr-client-id',
                    oauth_client_secret: 'dcr-secret'
                });
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('dynamic'));
                const editSpy = vi.spyOn(shared.configService, 'editProviderConfig').mockResolvedValue(integration as never);

                const result = await integrationService.update({
                    environmentId: 42,
                    integrationId: 'mcp1',
                    displayName: 'Renamed display',
                    credentials: { type: 'MCP_OAUTH2', scopes: 'offline_access,extra_scope' }
                });

                expect(result.isOk()).toBe(true);
                expect(editSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        display_name: 'Renamed display',
                        oauth_client_id: 'dcr-client-id',
                        oauth_client_secret: 'dcr-secret',
                        oauth_scopes: 'offline_access,extra_scope'
                    }),
                    mcpProviderFixture('dynamic')
                );
            });

            it('rejects setting client_id/secret on a dynamically registered integration', async () => {
                const integration = integrationFixture({ uniqueKey: 'mcp1', provider: 'mcp1' });
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('dynamic'));
                const editSpy = vi.spyOn(shared.configService, 'editProviderConfig');

                const result = await integrationService.update({
                    environmentId: 42,
                    integrationId: 'mcp1',
                    credentials: { type: 'MCP_OAUTH2', client_id: 'hacker-id' }
                });

                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error).toMatchObject({ code: 'incompatible_credentials' });
                }
                expect(editSpy).not.toHaveBeenCalled();
            });

            it('rotates client_id/secret for a statically registered integration', async () => {
                const integration = integrationFixture({
                    uniqueKey: 'mcp2',
                    provider: 'mcp2',
                    oauth_client_id: 'my-client-id',
                    oauth_client_secret: 'old-secret'
                });
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('static'));
                const editSpy = vi.spyOn(shared.configService, 'editProviderConfig').mockResolvedValue(integration as never);

                const result = await integrationService.update({
                    environmentId: 42,
                    integrationId: 'mcp2',
                    credentials: { type: 'MCP_OAUTH2', client_secret: 'new-secret' }
                });

                expect(result.isOk()).toBe(true);
                expect(editSpy).toHaveBeenCalledWith(expect.objectContaining({ oauth_client_secret: 'new-secret' }), mcpProviderFixture('static'));
            });

            it('keeps a CIMD client_id in sync when the integration is renamed and Nango is reachable over HTTPS', async () => {
                const integration = integrationFixture({
                    uniqueKey: 'mcp3',
                    provider: 'mcp3',
                    oauth_client_id: 'https://nango.example.com/oauth/client-metadata/environment-uuid/mcp3'
                });
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('cimd'));
                vi.spyOn(shared.configService, 'getIdByProviderConfigKey').mockResolvedValue(null);
                vi.spyOn(shared.connectionService, 'countConnections').mockResolvedValue(0);
                vi.spyOn(shared, 'getGlobalClientMetadataDocumentUrl').mockImplementation(
                    (environmentUuid, providerConfigKey) => `https://nango.example.com/oauth/client-metadata/${environmentUuid}/${providerConfigKey}`
                );
                const editSpy = vi.spyOn(shared.configService, 'editProviderConfig').mockResolvedValue(integration as never);

                const result = await integrationService.update({
                    environmentId: 42,
                    integrationId: 'mcp3',
                    newIntegrationId: 'mcp3-renamed',
                    environment: environmentFixture
                });

                expect(result.isOk()).toBe(true);
                expect(editSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        unique_key: 'mcp3-renamed',
                        oauth_client_id: 'https://nango.example.com/oauth/client-metadata/environment-uuid/mcp3-renamed'
                    }),
                    mcpProviderFixture('cimd')
                );
            });

            it('rejects renaming a CIMD integration when Nango is not reachable over HTTPS, instead of leaving a stale client_id', async () => {
                const integration = integrationFixture({
                    uniqueKey: 'mcp3',
                    provider: 'mcp3',
                    oauth_client_id: 'https://nango.example.com/oauth/client-metadata/environment-uuid/mcp3'
                });
                vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
                vi.spyOn(shared, 'getProvider').mockReturnValue(mcpProviderFixture('cimd'));
                vi.spyOn(shared.configService, 'getIdByProviderConfigKey').mockResolvedValue(null);
                vi.spyOn(shared.connectionService, 'countConnections').mockResolvedValue(0);
                vi.spyOn(shared, 'getGlobalClientMetadataDocumentUrl').mockReturnValue(null);
                const editSpy = vi.spyOn(shared.configService, 'editProviderConfig');

                const result = await integrationService.update({
                    environmentId: 42,
                    integrationId: 'mcp3',
                    newIntegrationId: 'mcp3-renamed',
                    environment: environmentFixture
                });

                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error).toMatchObject({ code: 'invalid_integration_config' });
                }
                expect(editSpy).not.toHaveBeenCalled();
            });
        });
    });

    describe('delete', () => {
        it('deletes an integration in its environment and returns domain data', async () => {
            const orchestrator = {} as Orchestrator;
            const service = new IntegrationService(undefined, orchestrator);
            const integration = integrationFixture({ uniqueKey: 'github', provider: 'github', id: 7 });
            const getSpy = vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
            const deleteSpy = vi.spyOn(shared.configService, 'deleteProviderConfig').mockResolvedValue(true);

            const result = await service.delete({ environmentId: 42, integrationId: 'github' });

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toStrictEqual({ integrationId: 'github' });
            }
            expect(getSpy).toHaveBeenCalledWith('github', 42);
            expect(deleteSpy).toHaveBeenCalledWith({
                id: 7,
                providerConfigKey: 'github',
                environmentId: 42,
                orchestrator
            });
        });

        it('returns a not found error without attempting deletion', async () => {
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
            const deleteSpy = vi.spyOn(shared.configService, 'deleteProviderConfig');

            const result = await integrationService.delete({ environmentId: 42, integrationId: 'missing' });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({
                    code: 'not_found',
                    message: 'Integration "missing" does not exist'
                });
            }
            expect(deleteSpy).not.toHaveBeenCalled();
        });

        it('returns a deletion error when persistence does not delete the integration', async () => {
            const errorSpy = vi.fn();
            const service = new IntegrationService({ error: errorSpy });
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integrationFixture({ uniqueKey: 'github', provider: 'github', id: 7 }));
            vi.spyOn(shared.configService, 'deleteProviderConfig').mockResolvedValue(false);

            const result = await service.delete({ environmentId: 42, integrationId: 'github' });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'delete_failed', message: 'Failed to delete integration' });
            }
            expect(errorSpy).toHaveBeenCalledWith('Integration deletion failed', {
                failureCode: 'delete_failed',
                integrationId: 'github',
                errorKind: 'not_deleted'
            });
        });

        it('returns a deletion error when the integration database ID is missing', async () => {
            const errorSpy = vi.fn();
            const service = new IntegrationService({ error: errorSpy });
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(
                integrationFixture({ uniqueKey: 'github', provider: 'github', id: undefined })
            );
            const deleteSpy = vi.spyOn(shared.configService, 'deleteProviderConfig');

            const result = await service.delete({ environmentId: 42, integrationId: 'github' });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'delete_failed', message: 'Failed to delete integration' });
            }
            expect(deleteSpy).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledWith('Integration deletion failed', {
                failureCode: 'delete_failed',
                integrationId: 'github',
                errorKind: 'missing_database_id'
            });
        });

        it('wraps and logs unexpected persistence deletion failures', async () => {
            const errorSpy = vi.fn();
            const service = new IntegrationService({ error: errorSpy });
            const cause = Object.assign(new Error('database failed'), { code: '23505' });
            vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integrationFixture({ uniqueKey: 'github', provider: 'github', id: 7 }));
            vi.spyOn(shared.configService, 'deleteProviderConfig').mockRejectedValue(cause);

            const result = await service.delete({ environmentId: 42, integrationId: 'github' });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toMatchObject({ code: 'delete_failed', message: 'Failed to delete integration', cause });
            }
            expect(errorSpy).toHaveBeenCalledWith('Integration deletion failed', {
                failureCode: 'delete_failed',
                integrationId: 'github',
                errorKind: 'exception',
                cause,
                machineErrorCode: '23505'
            });
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

function mcpProviderFixture(clientRegistration: 'static' | 'dynamic' | 'cimd'): Provider {
    return {
        display_name: 'Test MCP',
        auth_mode: 'MCP_OAUTH2',
        client_registration: clientRegistration,
        registration_url: 'https://mcp.example.com/register',
        docs: ''
    } as Provider;
}

function sharedCredentialsFixture(credentialOverrides?: { app_link?: string }): DBSharedCredentials {
    return {
        id: 12,
        name: 'github',
        credentials: {
            oauth_client_id: 'client-id',
            oauth_client_secret: 'client-secret',
            oauth_client_secret_iv: 'iv',
            oauth_client_secret_tag: 'tag',
            ...credentialOverrides
        },
        created_at: createdAt,
        updated_at: updatedAt
    };
}
