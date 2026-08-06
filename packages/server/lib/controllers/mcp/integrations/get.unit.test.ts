import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import integrationService, { IntegrationServiceError } from '../../../services/integration.service.js';
import { PublicMcpError } from '../utils.js';
import { getIntegrationsTool } from './get.js';

import type { ControlPlaneMcpContext } from '../controlPlaneTool.js';
import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

describe('getIntegrationsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns an integration without credentials when only the read scope is granted', async () => {
        const integration = integrationFixture();
        const provider = providerFixture();
        vi.spyOn(integrationService, 'get').mockImplementation(({ includeWebhook, includeCredentials }) =>
            Promise.resolve(
                Ok({
                    integration,
                    provider,
                    ...(includeWebhook ? { webhookUrl: 'https://example.com/webhook' } : {}),
                    ...(includeCredentials
                        ? {
                              credentials: {
                                  type: 'OAUTH2',
                                  clientId: 'client-id',
                                  clientSecret: 'client-secret',
                                  scopes: null,
                                  webhookSecret: null
                              } as const
                          }
                        : {})
                })
            )
        );

        const result = await getIntegrationsTool.handler(
            { integration_id: 'github', include: ['webhook', 'credentials'] },
            context(['environment:integrations:read'])
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.data).toMatchObject({
                unique_key: 'github',
                webhook_url: 'https://example.com/webhook'
            });
            expect(result.value.data).not.toHaveProperty('credentials');
        }
    });

    it('returns explicitly requested credentials with the credential-reading scope', async () => {
        const integration = integrationFixture();
        const provider = providerFixture();
        vi.spyOn(integrationService, 'get').mockResolvedValue(
            Ok({
                integration,
                provider,
                credentials: {
                    type: 'OAUTH2',
                    clientId: 'client-id',
                    clientSecret: 'client-secret',
                    scopes: 'repo,user',
                    webhookSecret: null
                }
            })
        );

        const result = await getIntegrationsTool.handler(
            { integration_id: 'github', include: ['credentials'] },
            context(['environment:integrations:read_credentials'])
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.data.credentials).toStrictEqual({
                type: 'OAUTH2',
                client_id: 'client-id',
                client_secret: 'client-secret',
                scopes: 'repo,user',
                webhook_secret: null
            });
        }
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

function context(grantedScopes: string[]): ControlPlaneMcpContext {
    return {
        account: {},
        environment: { id: 42, uuid: 'environment-uuid' },
        grantedScopes
    } as ControlPlaneMcpContext;
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
