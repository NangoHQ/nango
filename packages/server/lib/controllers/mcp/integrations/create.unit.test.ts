import { afterEach, describe, expect, it, vi } from 'vitest';

import { basePublicUrl, Err, flags, Ok } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import integrationService, { IntegrationServiceError } from '../../../services/integration.service.js';
import { PublicMcpError } from '../utils.js';
import { createIntegrationsTool } from './create.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:integrations:create']
} as ManagementMcpContext;

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

describe('createIntegrationsTool', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        vi.restoreAllMocks();
    });

    it('creates and formats an integration with caller-supplied credentials', async () => {
        const integration = integrationFixture();
        const provider = providerFixture();
        const createSpy = vi.spyOn(integrationService, 'create').mockResolvedValue(Ok({ integration, provider }));

        const result = await createIntegrationsTool.handler(
            {
                provider: 'github',
                integration_id: 'github-own',
                credential_source: 'own',
                display_name: 'GitHub Own',
                forward_webhooks: false,
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret',
                    scopes: 'repo'
                },
                integration_config: { region: 'us' }
            },
            context
        );

        expect(createSpy).toHaveBeenCalledWith({
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
                scopes: 'repo'
            },
            integrationConfig: { region: 'us' }
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                data: {
                    unique_key: 'github-own',
                    provider: 'github',
                    display_name: 'GitHub Own',
                    logo: `${basePublicUrl}/images/template-logos/github.svg`,
                    forward_webhooks: false,
                    created_at: createdAt.toISOString(),
                    updated_at: updatedAt.toISOString()
                }
            });
        }
    });

    it('dispatches Nango-provided credentials without caller credential fields', async () => {
        vi.spyOn(integrationService, 'create').mockResolvedValue(Ok({ integration: integrationFixture(), provider: providerFixture() }));

        await createIntegrationsTool.handler(
            {
                provider: 'github',
                integration_id: 'github-own',
                credential_source: 'nango'
            },
            context
        );

        expect(integrationService.create).toHaveBeenCalledWith({
            environmentId: 42,
            provider: 'github',
            uniqueKey: 'github-own',
            credentialSource: 'nango',
            displayName: undefined,
            forwardWebhooks: undefined
        });
    });

    it('dispatches integration config independently of caller credentials', async () => {
        vi.spyOn(integrationService, 'create').mockResolvedValue(Ok({ integration: integrationFixture(), provider: providerFixture() }));

        await createIntegrationsTool.handler(
            {
                provider: 'private-api-generic',
                integration_id: 'private-api',
                credential_source: 'own',
                integration_config: { keyLabel: 'Workspace token' }
            },
            context
        );

        expect(integrationService.create).toHaveBeenCalledWith({
            environmentId: 42,
            provider: 'private-api-generic',
            uniqueKey: 'private-api',
            credentialSource: 'own',
            displayName: undefined,
            forwardWebhooks: undefined,
            integrationConfig: { keyLabel: 'Workspace token' }
        });
    });

    it('rejects invalid arguments before calling the service', async () => {
        const createSpy = vi.spyOn(integrationService, 'create');

        const result = await createIntegrationsTool.handler(
            {
                provider: 'github',
                integration_id: 'github',
                credential_source: 'nango',
                credentials: { type: 'OAUTH2', client_id: 'client-id', client_secret: 'client-secret' }
            },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain(
                'Invalid integrations_create arguments: credentials: credentials is only allowed when credential_source is own'
            );
        }
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('returns expected business errors as public MCP errors', async () => {
        vi.spyOn(integrationService, 'create').mockResolvedValue(
            Err(new IntegrationServiceError({ code: 'integration_exists', message: 'Integration already exists' }))
        );

        const result = await createIntegrationsTool.handler(
            {
                provider: 'github',
                integration_id: 'github',
                credential_source: 'nango'
            },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Integration ID already exists');
        }
    });

    it('audits creation without including credentials or integration configuration values', async () => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        vi.spyOn(integrationService, 'create').mockResolvedValue(Ok({ integration: integrationFixture(), provider: providerFixture() }));
        const auditedContext = {
            account: { id: 1, uuid: 'account-uuid' },
            environment: { id: 42, uuid: 'e0000000-0000-4000-8000-000000000042', name: 'dev' },
            grantedScopes: ['environment:integrations:create'],
            audit: {
                actor: { type: 'api_key', id: '7', display: 'Management key' },
                context: { ip: '127.0.0.1', userAgent: 'test-client' }
            }
        } as ManagementMcpContext;

        const result = await createIntegrationsTool.handler(
            {
                provider: 'github',
                integration_id: 'github-own',
                credential_source: 'own',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id-secret',
                    client_secret: 'client-secret-value'
                },
                integration_config: { tenantSecret: 'configuration-secret-value' }
            },
            auditedContext
        );

        expect(result.isOk()).toBe(true);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalledWith({
                occurredAt: expect.any(String),
                accountId: 1,
                scope: 'environment',
                environment: { id: 'e0000000-0000-4000-8000-000000000042', display: 'dev' },
                actor: { type: 'api_key', id: '7', display: 'Management key' },
                resource: 'integration',
                action: 'created',
                targets: [{ type: 'integration', id: 'github-own' }],
                context: { interface: 'mcp', ip: '127.0.0.1', userAgent: 'test-client' },
                outcome: 'success',
                metadata: { provider: 'github' }
            });
        });

        const serializedEvent = JSON.stringify(auditSpy.mock.calls[0]?.[0]);
        expect(serializedEvent).not.toContain('client-id-secret');
        expect(serializedEvent).not.toContain('client-secret-value');
        expect(serializedEvent).not.toContain('configuration-secret-value');
    });
});

function integrationFixture(): Config {
    return {
        unique_key: 'github-own',
        provider: 'github',
        oauth_client_id: '',
        oauth_client_secret: '',
        environment_id: 42,
        missing_fields: [],
        display_name: 'GitHub Own',
        forward_webhooks: false,
        shared_credentials_id: null,
        created_at: createdAt,
        updated_at: updatedAt
    };
}

function providerFixture(): Provider {
    return {
        display_name: 'GitHub',
        auth_mode: 'OAUTH2',
        docs: ''
    };
}
