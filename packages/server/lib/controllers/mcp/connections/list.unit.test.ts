import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectionService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { PublicMcpError } from '../utils.js';
import { listConnectionsTool } from './list.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { ListedConnection } from '@nangohq/shared';
import type { DBConnectionAsJSONRow, DBEndUser } from '@nangohq/types';

describe('listConnectionsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps MCP filters to the connection service and formats its domain result', async () => {
        const listSpy = vi.spyOn(connectionService, 'listConnections').mockResolvedValue(Ok([connectionFixture()]));

        const result = await listConnectionsTool.handler(
            {
                connection_id: 'connection-id',
                search: 'acme',
                end_user_id: 'end-user-id',
                integration_id: 'github',
                end_user_organization_id: 'organization-id',
                tags: { Team: 'platform' },
                limit: 25,
                page: 2
            },
            context(['environment:connections:list'])
        );

        expect(listSpy).toHaveBeenCalledWith({
            environmentId: 42,
            connectionId: 'connection-id',
            search: 'acme',
            endUserId: 'end-user-id',
            integrationIds: ['github'],
            endUserOrganizationId: 'organization-id',
            tags: { team: 'platform' },
            limit: 25,
            page: 2,
            includeCredentials: false
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                connections: [
                    {
                        id: 1,
                        connection_id: 'connection-id',
                        provider_config_key: 'github',
                        provider: 'github',
                        created: '2026-01-01T00:00:00.000Z',
                        metadata: { tenant: 'acme' },
                        tags: { team: 'platform' },
                        errors: [{ type: 'auth', log_id: 'log-id' }],
                        end_user: {
                            id: 'end-user-id',
                            display_name: 'End User',
                            email: 'end-user@example.com',
                            tags: { tier: 'enterprise' },
                            organization: { id: 'organization-id', display_name: 'Acme' }
                        }
                    }
                ]
            });
        }
    });

    it.each(['environment:connections:list_credentials', 'environment:connections:*', 'environment:*'])('requests credentials with %s', async (scope) => {
        const listedConnection = connectionFixture();
        listedConnection.connection.credentials = { type: 'API_KEY', apiKey: 'secret' };
        const listSpy = vi.spyOn(connectionService, 'listConnections').mockResolvedValue(Ok([listedConnection]));

        const result = await listConnectionsTool.handler({}, context([scope]));

        expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ includeCredentials: true }));
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.connections[0]?.credentials).toStrictEqual({ type: 'API_KEY', apiKey: 'secret' });
        }
    });

    it('applies the list default in the MCP handler', async () => {
        const listSpy = vi.spyOn(connectionService, 'listConnections').mockResolvedValue(Ok([]));

        await listConnectionsTool.handler({}, context(['environment:connections:list']));

        expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 10_000 }));
    });

    it('rejects invalid arguments before calling the connection service', async () => {
        const listSpy = vi.spyOn(connectionService, 'listConnections');

        const result = await listConnectionsTool.handler({ limit: 0, unexpected: true }, context(['environment:connections:list']));

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid connections_list arguments:');
        }
        expect(listSpy).not.toHaveBeenCalled();
    });

    it('preserves internal connection service errors for the MCP error boundary', async () => {
        const error = new Error('Failed to list connections');
        vi.spyOn(connectionService, 'listConnections').mockResolvedValue(Err(error));

        const result = await listConnectionsTool.handler({}, context(['environment:connections:list']));

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBe(error);
            expect(result.error).not.toBeInstanceOf(PublicMcpError);
        }
    });
});

function context(grantedScopes: string[]): ManagementMcpContext {
    return {
        account: {},
        environment: { id: 42 },
        grantedScopes
    } as ManagementMcpContext;
}

function connectionFixture(): ListedConnection {
    return {
        connection: connectionDataFixture(),
        provider: 'github',
        active_logs: [{ type: 'auth', log_id: 'log-id' }],
        end_user: endUserFixture()
    };
}

function connectionDataFixture(): Omit<DBConnectionAsJSONRow, 'credentials'> {
    return {
        id: 1,
        config_id: 2,
        end_user_id: 3,
        provider_config_key: 'github',
        connection_id: 'connection-id',
        connection_config: {},
        webhook_url_override: null,
        environment_id: 42,
        metadata: { tenant: 'acme' },
        tags: { team: 'platform' },
        credentials_iv: null,
        credentials_tag: null,
        last_fetched_at: null,
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        deleted: false,
        deleted_at: null
    };
}

function endUserFixture(): DBEndUser {
    return {
        id: 3,
        end_user_id: 'end-user-id',
        account_id: 4,
        environment_id: 42,
        email: 'end-user@example.com',
        display_name: 'End User',
        organization_id: 'organization-id',
        organization_display_name: 'Acme',
        tags: { tier: 'enterprise' },
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: null
    };
}
