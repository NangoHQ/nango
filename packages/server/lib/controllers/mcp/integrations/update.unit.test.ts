import { afterEach, describe, expect, it, vi } from 'vitest';

import { basePublicUrl, Err, Ok } from '@nangohq/utils';

import integrationService, { IntegrationServiceError } from '../../../services/integration.service.js';
import { PublicMcpError } from '../utils.js';
import { integrationsUpdateTool } from './update.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:integrations:update']
} as ManagementMcpContext;

describe('integrationsUpdateTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps arguments to the service and independently formats its domain result', async () => {
        const integration = integrationFixture();
        const provider = providerFixture();
        const updateSpy = vi.spyOn(integrationService, 'update').mockResolvedValue(Ok({ integration, provider }));

        const result = await integrationsUpdateTool.handler(
            {
                integration_id: 'github',
                new_integration_id: 'github-renamed',
                display_name: 'GitHub Renamed',
                credentials: { type: 'OAUTH2', client_id: 'client-id', client_secret: 'client-secret' },
                forward_webhooks: false,
                integration_config: { region: 'eu' },
                custom: { tenant: 'acme' }
            },
            context
        );

        expect(updateSpy).toHaveBeenCalledWith({
            environmentId: 42,
            integrationId: 'github',
            newIntegrationId: 'github-renamed',
            displayName: 'GitHub Renamed',
            credentials: { type: 'OAUTH2', client_id: 'client-id', client_secret: 'client-secret' },
            forwardWebhooks: false,
            integrationConfig: { region: 'eu' },
            custom: { tenant: 'acme' }
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                data: {
                    unique_key: 'github-renamed',
                    provider: 'github',
                    display_name: 'GitHub Renamed',
                    logo: `${basePublicUrl}/images/template-logos/github.svg`,
                    forward_webhooks: false,
                    created_at: '2026-01-01T00:00:00.000Z',
                    updated_at: '2026-01-02T00:00:00.000Z'
                }
            });
        }
    });

    it('rejects invalid arguments before calling the service', async () => {
        const updateSpy = vi.spyOn(integrationService, 'update');

        const result = await integrationsUpdateTool.handler({ integration_id: 'github', unexpected: true }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid integrations_update arguments: arguments:');
        }
        expect(updateSpy).not.toHaveBeenCalled();
    });

    it.each([
        { code: 'not_found' as const, serviceMessage: 'Integration "missing" does not exist', publicMessage: 'Integration "missing" does not exist' },
        { code: 'integration_exists' as const, serviceMessage: 'duplicate', publicMessage: 'Integration ID already exists' },
        { code: 'incompatible_credentials' as const, serviceMessage: 'incompatible', publicMessage: 'Credentials are incompatible with the provider auth mode' }
    ])('maps $code business errors to public MCP errors', async ({ code, serviceMessage, publicMessage }) => {
        vi.spyOn(integrationService, 'update').mockResolvedValue(Err(new IntegrationServiceError({ code, message: serviceMessage })));

        const result = await integrationsUpdateTool.handler({ integration_id: 'github' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe(publicMessage);
        }
    });
});

function integrationFixture(): Config {
    return {
        unique_key: 'github-renamed',
        provider: 'github',
        oauth_client_id: 'client-id',
        oauth_client_secret: 'client-secret',
        environment_id: 42,
        missing_fields: [],
        display_name: 'GitHub Renamed',
        forward_webhooks: false,
        shared_credentials_id: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z')
    };
}

function providerFixture(): Provider {
    return { display_name: 'GitHub', auth_mode: 'OAUTH2', docs: '' };
}
