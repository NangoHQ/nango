import { afterEach, describe, expect, it, vi } from 'vitest';

import { basePublicUrl, Err, flags, Ok } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import integrationService, { IntegrationServiceError } from '../../../services/integration.service.js';
import { PublicMcpError } from '../utils.js';
import { updateIntegrationsTool } from './update.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:integrations:update']
} as ManagementMcpContext;

describe('updateIntegrationsTool', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        vi.restoreAllMocks();
    });

    it('maps arguments to the service and independently formats its domain result', async () => {
        const integration = integrationFixture();
        const provider = providerFixture();
        const updateSpy = vi.spyOn(integrationService, 'update').mockResolvedValue(Ok({ integration, provider }));

        const result = await updateIntegrationsTool.handler(
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

        const result = await updateIntegrationsTool.handler({ integration_id: 'github', unexpected: true }, context);

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

        const result = await updateIntegrationsTool.handler({ integration_id: 'github' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe(publicMessage);
        }
    });

    it('audits the updated integration without including credentials, configuration, or custom values', async () => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        vi.spyOn(integrationService, 'update').mockResolvedValue(Ok({ integration: integrationFixture(), provider: providerFixture() }));

        const result = await updateIntegrationsTool.handler(
            {
                integration_id: 'github',
                new_integration_id: 'github-renamed',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id-secret',
                    client_secret: 'client-secret-value'
                },
                integration_config: { tenantSecret: 'configuration-secret-value' },
                custom: { privateValue: 'custom-secret-value' }
            },
            auditedContext()
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
                action: 'updated',
                targets: [{ type: 'integration', id: 'github-renamed' }],
                context: { interface: 'mcp', ip: '127.0.0.1', userAgent: 'test-client' },
                outcome: 'success',
                metadata: { changedFields: ['unique_key', 'credentials', 'integration_config', 'custom'] }
            });
        });

        const serializedEvent = JSON.stringify(auditSpy.mock.calls[0]?.[0]);
        expect(serializedEvent).not.toContain('client-id-secret');
        expect(serializedEvent).not.toContain('client-secret-value');
        expect(serializedEvent).not.toContain('configuration-secret-value');
        expect(serializedEvent).not.toContain('custom-secret-value');
    });

    it('audits failed updates without a target or submitted credential values', async () => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        vi.spyOn(integrationService, 'update').mockResolvedValue(
            Err(new IntegrationServiceError({ code: 'incompatible_credentials', message: 'incompatible credentials' }))
        );

        const result = await updateIntegrationsTool.handler(
            {
                integration_id: 'github',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id-secret',
                    client_secret: 'client-secret-value'
                }
            },
            auditedContext()
        );

        expect(result.isErr()).toBe(true);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountId: 1,
                    resource: 'integration',
                    action: 'updated',
                    targets: [],
                    outcome: 'failure',
                    metadata: { changedFields: ['credentials'] }
                })
            );
        });
        expect(JSON.stringify(auditSpy.mock.calls[0]?.[0])).not.toContain('client-secret-value');
    });
});

function auditedContext(): ManagementMcpContext {
    return {
        account: { id: 1, uuid: 'account-uuid' },
        environment: { id: 42, uuid: 'e0000000-0000-4000-8000-000000000042', name: 'dev' },
        grantedScopes: ['environment:integrations:update'],
        audit: {
            actor: { type: 'api_key', id: '7', display: 'Management key' },
            context: { ip: '127.0.0.1', userAgent: 'test-client' }
        }
    } as ManagementMcpContext;
}

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
