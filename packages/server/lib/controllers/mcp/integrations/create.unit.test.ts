import { afterEach, describe, expect, it, vi } from 'vitest';

import { basePublicUrl, Err, Ok } from '@nangohq/utils';

import integrationService, { IntegrationServiceError } from '../../../services/integration.service.js';
import { PublicMcpError } from '../utils.js';
import { integrationsCreateTool } from './create.js';

import type { ControlPlaneMcpContext } from '../controlPlaneTool.js';
import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:integrations:create']
} as ControlPlaneMcpContext;

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

describe('integrationsCreateTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates and formats an integration with caller-supplied credentials', async () => {
        const integration = integrationFixture();
        const provider = providerFixture();
        const createSpy = vi.spyOn(integrationService, 'create').mockResolvedValue(Ok({ integration, provider }));

        const result = await integrationsCreateTool.handler(
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

        await integrationsCreateTool.handler(
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

        await integrationsCreateTool.handler(
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

        const result = await integrationsCreateTool.handler(
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
            expect(result.error.message).toContain('Invalid integrations_create arguments: arguments:');
        }
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('returns expected business errors as public MCP errors', async () => {
        vi.spyOn(integrationService, 'create').mockResolvedValue(
            Err(new IntegrationServiceError({ code: 'integration_exists', message: 'Integration already exists' }))
        );

        const result = await integrationsCreateTool.handler(
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
