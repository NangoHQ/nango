import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import * as connectSessionService from '../../../services/connectSession.service.js';
import { CreateConnectSessionError } from '../../../services/connectSession.service.js';
import { createConnectSessionTool } from './create.js';

import type { ManagementMcpContext } from '../managementTool.js';

const context = {
    account: { id: 1 },
    environment: { id: 42 },
    plan: null,
    grantedScopes: ['environment:connect_sessions:write']
} as ManagementMcpContext;

describe('createConnectSessionTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps validated arguments to the service and independently formats its domain result', async () => {
        const expiresAt = new Date('2026-01-01T00:30:00.000Z');
        const createSpy = vi
            .spyOn(connectSessionService, 'createConnectSession')
            .mockResolvedValue(Ok({ token: 'session-token', connectLink: 'https://connect.example.com/session-token', expiresAt }));

        const result = await createConnectSessionTool.handler(
            {
                end_user: {
                    id: 'end-user-id',
                    email: 'user@example.com',
                    display_name: 'End User',
                    tags: { Tier: 'enterprise' }
                },
                organization: { id: 'acme', display_name: 'Acme' },
                tags: { Team: 'platform' },
                allowed_integrations: ['github'],
                integrations_config_defaults: {
                    github: {
                        user_scopes: 'repo',
                        authorization_params: { prompt: 'consent' },
                        connection_config: { subdomain: 'acme' }
                    }
                },
                overrides: { github: { docs_connect: 'https://example.com/docs' } },
                webhook_url_override: 'https://example.com/webhook'
            },
            context
        );

        expect(createSpy).toHaveBeenCalledWith({
            account: context.account,
            environment: context.environment,
            plan: null,
            endUser: {
                endUserId: 'end-user-id',
                email: 'user@example.com',
                displayName: 'End User',
                tags: { Tier: 'enterprise' },
                organization: { organizationId: 'acme', displayName: 'Acme' }
            },
            tags: { team: 'platform' },
            allowedIntegrations: ['github'],
            integrationsConfigDefaults: {
                github: {
                    user_scopes: 'repo',
                    authorization_params: { prompt: 'consent' },
                    connectionConfig: { subdomain: 'acme' }
                }
            },
            overrides: { github: { docs_connect: 'https://example.com/docs' } },
            webhookUrlOverride: 'https://example.com/webhook'
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                token: 'session-token',
                connect_link: 'https://connect.example.com/session-token',
                expires_at: expiresAt.toISOString()
            });
        }
    });

    it('accepts top-level tags without an end user', async () => {
        const createSpy = vi
            .spyOn(connectSessionService, 'createConnectSession')
            .mockResolvedValue(Ok({ token: 'session-token', connectLink: 'https://connect.example.com/session-token', expiresAt: new Date() }));

        const result = await createConnectSessionTool.handler({ tags: { Team: 'platform' } }, context);

        expect(result.isOk()).toBe(true);
        expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ endUser: null, tags: { team: 'platform' } }));
    });

    it('rejects invalid arguments before calling the service', async () => {
        const createSpy = vi.spyOn(connectSessionService, 'createConnectSession');

        const result = await createConnectSessionTool.handler({ allowed_integrations: ['github'], unexpected: true }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain('Invalid connect_session_create arguments:');
        }
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('rejects the deprecated nested webhook URL before calling the service', async () => {
        const createSpy = vi.spyOn(connectSessionService, 'createConnectSession');

        const result = await createConnectSessionTool.handler(
            {
                end_user: { id: 'end-user-id' },
                integrations_config_defaults: {
                    github: {
                        connection_config: { webhook_url: 'https://example.com/webhook' }
                    }
                }
            },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain(
                'integrations_config_defaults.github.connection_config.webhook_url: connection_config.webhook_url is not supported; use top-level webhook_url_override instead'
            );
        }
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('returns expected service errors as public MCP errors', async () => {
        vi.spyOn(connectSessionService, 'createConnectSession').mockResolvedValue(
            Err(
                new CreateConnectSessionError({
                    code: 'integration_not_found',
                    message: 'One or more integrations do not exist',
                    missingIntegrations: [{ integrationId: 'missing', source: 'allowedIntegrations', index: 0 }]
                })
            )
        );

        const result = await createConnectSessionTool.handler({ end_user: { id: 'end-user-id' }, allowed_integrations: ['missing'] }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('Integrations do not exist: missing');
        }
    });

    it('preserves internal service errors for the MCP error boundary', async () => {
        vi.spyOn(connectSessionService, 'createConnectSession').mockResolvedValue(
            Err(new CreateConnectSessionError({ code: 'token_creation_failed', message: 'sensitive keystore failure' }))
        );

        const result = await createConnectSessionTool.handler({ end_user: { id: 'end-user-id' } }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(CreateConnectSessionError);
            expect(result.error.message).toBe('sensitive keystore failure');
        }
    });
});
