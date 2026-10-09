import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import integrationService, { IntegrationServiceError } from '../../../services/integration.service.js';
import { PublicMcpError } from '../utils.js';
import { getIntegrationsTool } from './get.js';
import { getIntegrationOutputSchema } from './schema.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

describe('getIntegrationsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns an integration and optional webhook without credentials', async () => {
        const getSpy = vi.spyOn(integrationService, 'get').mockResolvedValue(
            Ok({
                integration: integrationFixture(),
                provider: providerFixture(),
                webhookUrl: 'https://example.com/webhook',
                credentials: {
                    type: 'OAUTH2',
                    clientId: 'client-id',
                    clientSecret: 'client-secret',
                    scopes: null,
                    webhookSecret: null
                }
            })
        );

        const result = await getIntegrationsTool.handler(
            { integration_id: 'github', include: ['webhook'] },
            context(['environment:integrations:read_credentials'])
        );

        expect(getSpy).toHaveBeenCalledWith(expect.objectContaining({ includeWebhook: true, includeCredentials: false }));
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.data).toMatchObject({
                unique_key: 'github',
                webhook_url: 'https://example.com/webhook'
            });
            expect(result.value.data).not.toHaveProperty('credentials');
            expect(JSON.stringify(result.value)).not.toContain('client-secret');
            expect(() => getIntegrationOutputSchema.parse(result.value)).not.toThrow();
        }
    });

    it('rejects the removed credentials include', async () => {
        const getSpy = vi.spyOn(integrationService, 'get');

        const result = await getIntegrationsTool.handler(
            { integration_id: 'github', include: ['credentials'] },
            context(['environment:integrations:read_credentials'])
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid integrations_get arguments:');
        }
        expect(getSpy).not.toHaveBeenCalled();
    });

    it('rejects invalid arguments before calling the integration service', async () => {
        const getSpy = vi.spyOn(integrationService, 'get');

        const result = await getIntegrationsTool.handler({ integration_id: 'github', unexpected: true }, context(['environment:integrations:read']));

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid integrations_get arguments: arguments:');
        }
        expect(getSpy).not.toHaveBeenCalled();
    });

    it('maps missing integrations to public MCP errors', async () => {
        vi.spyOn(integrationService, 'get').mockResolvedValue(
            Err(
                new IntegrationServiceError({
                    code: 'not_found',
                    message: 'Integration "missing" does not exist'
                })
            )
        );

        const result = await getIntegrationsTool.handler({ integration_id: 'missing' }, context(['environment:integrations:read']));

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Integration "missing" does not exist');
        }
    });
});

function context(grantedScopes: string[]): ManagementMcpContext {
    return {
        account: {},
        environment: { id: 42, uuid: 'environment-uuid' },
        grantedScopes
    } as ManagementMcpContext;
}

function integrationFixture(): Config {
    return {
        unique_key: 'github',
        provider: 'github',
        oauth_client_id: 'client-id',
        oauth_client_secret: 'client-secret',
        environment_id: 42,
        missing_fields: [],
        display_name: null,
        forward_webhooks: true,
        allow_unverified_webhooks: false,
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
