import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectionService as sharedConnectionService } from '@nangohq/shared';

import connectionService from './connection.service.js';

import type { DBConnectionAsJSONRow, DBEndUser } from '@nangohq/types';

describe('connectionService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('lists domain connections using the public filters and defaults', async () => {
        const rawConnection = connectionFixture();
        const endUser = endUserFixture();
        const listSpy = vi.spyOn(sharedConnectionService, 'listConnections').mockResolvedValue([
            {
                connection: rawConnection,
                provider: 'github',
                active_logs: [{ type: 'auth', log_id: 'log-id' }],
                end_user: endUser
            }
        ]);

        const result = await connectionService.list({
            environmentId: 42,
            connectionId: 'connection-id',
            search: 'acme',
            endUserId: 'end-user-id',
            integrationIds: ['github'],
            endUserOrganizationId: 'organization-id',
            tags: { team: 'platform' },
            includeCredentials: true
        });

        expect(listSpy).toHaveBeenCalledWith({
            environmentId: 42,
            connectionId: 'connection-id',
            search: 'acme',
            endUserId: 'end-user-id',
            integrationIds: ['github'],
            endUserOrganizationId: 'organization-id',
            tags: { team: 'platform' },
            limit: 10_000,
            page: 0
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual([
                {
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
                    },
                    credentials: { type: 'API_KEY', apiKey: 'secret' }
                }
            ]);
        }
    });

    it('omits credentials from domain results unless requested', async () => {
        vi.spyOn(sharedConnectionService, 'listConnections').mockResolvedValue([
            {
                connection: connectionFixture(),
                provider: 'github',
                active_logs: [],
                end_user: null
            }
        ]);

        const result = await connectionService.list({ environmentId: 42, limit: 25, page: 2 });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value[0]).not.toHaveProperty('credentials');
        }
    });

    it('wraps connection listing failures as service errors', async () => {
        const cause = new Error('database unavailable');
        vi.spyOn(sharedConnectionService, 'listConnections').mockRejectedValue(cause);

        const result = await connectionService.list({ environmentId: 42 });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'list_failed',
                message: 'Failed to list connections',
                cause
            });
        }
    });
});

function connectionFixture(): DBConnectionAsJSONRow {
    return {
        id: 1,
        config_id: 2,
        end_user_id: 3,
        tags: { team: 'platform' },
        provider_config_key: 'github',
        connection_id: 'connection-id',
        connection_config: {},
        webhook_url_override: null,
        environment_id: 42,
        metadata: { tenant: 'acme' },
        credentials: { type: 'API_KEY', apiKey: 'secret' } as unknown as DBConnectionAsJSONRow['credentials'],
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
