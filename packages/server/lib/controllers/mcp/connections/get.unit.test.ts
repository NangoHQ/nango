import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectionService, GetConnectionError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { PublicMcpError } from '../utils.js';
import { getConnectionsTool } from './get.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { RetrievedConnection } from '@nangohq/shared';

describe('getConnectionsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses the read-only service path and omits credentials with the read scope', async () => {
        const getSpy = vi.spyOn(connectionService, 'getConnectionWithoutCredentials').mockResolvedValue(Ok({ ...connectionFixture(), credentials: undefined }));
        const getWithCredentialsSpy = vi.spyOn(connectionService, 'getConnectionWithCredentials');

        const result = await getConnectionsTool.handler(
            { connection_id: 'connection-id', integration_id: 'github' },
            context(['environment:connections:read'])
        );

        expect(getSpy).toHaveBeenCalledWith({
            environmentId: 42,
            connectionId: 'connection-id',
            integrationId: 'github'
        });
        expect(getWithCredentialsSpy).not.toHaveBeenCalled();
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).not.toHaveProperty('credentials');
            expect(result.value).toMatchObject({ connection_id: 'connection-id', provider_config_key: 'github' });
        }
    });

    it.each(['refresh_token', 'force_refresh', 'refresh_github_app_jwt_token'] as const)(
        'rejects %s without the credential-reading scope',
        async (argument) => {
            const getSpy = vi.spyOn(connectionService, 'getConnectionWithCredentials');

            const result = await getConnectionsTool.handler(
                { connection_id: 'connection-id', integration_id: 'github', [argument]: true },
                context(['environment:connections:read'])
            );

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error).toBeInstanceOf(PublicMcpError);
                expect(result.error.message).toContain('environment:connections:read_credentials');
            }
            expect(getSpy).not.toHaveBeenCalled();
        }
    );

    it('returns credentials with the credential-reading scope', async () => {
        const getSpy = vi.spyOn(connectionService, 'getConnectionWithCredentials').mockResolvedValue(Ok(connectionFixture()));

        const result = await getConnectionsTool.handler(
            { connection_id: 'connection-id', integration_id: 'github' },
            context(['environment:connections:read_credentials'])
        );

        expect(getSpy).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'connection-id', integrationId: 'github' }));
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.credentials).toStrictEqual({ type: 'API_KEY', apiKey: 'secret' });
        }
    });

    it('rejects invalid arguments before calling the connection service', async () => {
        const getSpy = vi.spyOn(connectionService, 'getConnectionWithCredentials');
        const getWithoutCredentialsSpy = vi.spyOn(connectionService, 'getConnectionWithoutCredentials');

        const result = await getConnectionsTool.handler({ connection_id: 'connection-id' }, context(['environment:connections:read']));

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid connections_get arguments:');
        }
        expect(getSpy).not.toHaveBeenCalled();
        expect(getWithoutCredentialsSpy).not.toHaveBeenCalled();
    });

    it.each([
        ['unknown_provider_config', 'Provider does not exist'],
        ['not_found', 'Connection does not exist'],
        ['invalid_credentials', 'Credentials are invalid']
    ] as const)('maps %s service errors to public MCP errors', async (code, message) => {
        vi.spyOn(connectionService, 'getConnectionWithoutCredentials').mockResolvedValue(Err(new GetConnectionError({ code, message })));

        const result = await getConnectionsTool.handler(
            { connection_id: 'connection-id', integration_id: 'github' },
            context(['environment:connections:read'])
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe(message);
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

function connectionFixture(): RetrievedConnection {
    return {
        connection: {
            id: 1,
            config_id: 2,
            end_user_id: null,
            provider_config_key: 'github',
            connection_id: 'connection-id',
            connection_config: {},
            webhook_url_override: null,
            environment_id: 42,
            metadata: null,
            tags: {},
            credentials_iv: null,
            credentials_tag: null,
            last_fetched_at: new Date('2026-01-03T00:00:00.000Z'),
            credentials_expires_at: null,
            last_refresh_failure: null,
            last_refresh_success: null,
            refresh_attempts: null,
            refresh_exhausted: false,
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            updated_at: new Date('2026-01-02T00:00:00.000Z'),
            deleted: false,
            deleted_at: null
        },
        credentials: { type: 'API_KEY', apiKey: 'secret' },
        endUser: null,
        activeLogs: [],
        provider: 'github'
    };
}
