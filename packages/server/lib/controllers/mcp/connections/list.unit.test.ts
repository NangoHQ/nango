import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import connectionService, { ConnectionServiceError } from '../../../services/connection.service.js';
import { PublicMcpError } from '../utils.js';
import { listConnectionsTool } from './list.js';

import type { ListedConnection } from '../../../services/connection.service.js';
import type { ManagementMcpContext } from '../managementTool.js';

describe('listConnectionsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps MCP filters to the connection service and formats its domain result', async () => {
        const listSpy = vi.spyOn(connectionService, 'list').mockResolvedValue(Ok([connectionFixture()]));

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
        const listSpy = vi
            .spyOn(connectionService, 'list')
            .mockResolvedValue(Ok([{ ...connectionFixture(), credentials: { type: 'API_KEY', apiKey: 'secret' } }]));

        const result = await listConnectionsTool.handler({}, context([scope]));

        expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ includeCredentials: true }));
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.connections[0]?.credentials).toStrictEqual({ type: 'API_KEY', apiKey: 'secret' });
        }
    });

    it('rejects invalid arguments before calling the connection service', async () => {
        const listSpy = vi.spyOn(connectionService, 'list');

        const result = await listConnectionsTool.handler({ limit: 0, unexpected: true }, context(['environment:connections:list']));

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid connections_list arguments:');
        }
        expect(listSpy).not.toHaveBeenCalled();
    });

    it('preserves internal connection service errors for the MCP error boundary', async () => {
        const error = new ConnectionServiceError({ message: 'Failed to list connections' });
        vi.spyOn(connectionService, 'list').mockResolvedValue(Err(error));

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
        id: 1,
        connectionId: 'connection-id',
        integrationId: 'github',
        provider: 'github',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        metadata: { tenant: 'acme' },
        tags: { team: 'platform' },
        errors: [{ type: 'auth', logId: 'log-id' }],
        endUser: {
            id: 'end-user-id',
            displayName: 'End User',
            email: 'end-user@example.com',
            tags: { tier: 'enterprise' },
            organization: { id: 'organization-id', displayName: 'Acme' }
        }
    };
}
