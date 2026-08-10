import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import connectionRetrievalService, { ConnectionRetrievalServiceError } from '../../../services/connectionRetrieval.service.js';
import { PublicMcpError } from '../utils.js';
import { getConnectionsTool } from './get.js';

import type { RetrievedConnection } from '../../../services/connectionRetrieval.service.js';
import type { ManagementMcpContext } from '../managementTool.js';

describe('getConnectionsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps refresh arguments and omits credentials with the read scope', async () => {
        const getSpy = vi.spyOn(connectionRetrievalService, 'get').mockResolvedValue(Ok(connectionFixture()));

        const result = await getConnectionsTool.handler(
            {
                connection_id: 'connection-id',
                integration_id: 'github',
                refresh_token: true,
                force_refresh: true,
                refresh_github_app_jwt_token: true
            },
            context(['environment:connections:read'])
        );

        expect(getSpy).toHaveBeenCalledWith({
            account: expect.any(Object),
            environment: expect.objectContaining({ id: 42 }),
            connectionId: 'connection-id',
            integrationId: 'github',
            returnRefreshToken: true,
            forceRefresh: true,
            refreshGithubAppJwtToken: true
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).not.toHaveProperty('credentials');
            expect(result.value).toMatchObject({ connection_id: 'connection-id', provider_config_key: 'github' });
        }
    });

    it('returns credentials with the credential-reading scope', async () => {
        vi.spyOn(connectionRetrievalService, 'get').mockResolvedValue(Ok(connectionFixture()));

        const result = await getConnectionsTool.handler(
            { connection_id: 'connection-id', integration_id: 'github' },
            context(['environment:connections:read_credentials'])
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.credentials).toStrictEqual({ type: 'API_KEY', apiKey: 'secret' });
        }
    });

    it('rejects invalid arguments before calling the connection service', async () => {
        const getSpy = vi.spyOn(connectionRetrievalService, 'get');

        const result = await getConnectionsTool.handler({ connection_id: 'connection-id' }, context(['environment:connections:read']));

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid connections_get arguments:');
        }
        expect(getSpy).not.toHaveBeenCalled();
    });

    it.each([
        ['unknown_provider_config', 'Provider does not exist'],
        ['not_found', 'Connection does not exist'],
        ['invalid_credentials', 'Credentials are invalid']
    ] as const)('maps %s service errors to public MCP errors', async (code, message) => {
        vi.spyOn(connectionRetrievalService, 'get').mockResolvedValue(Err(new ConnectionRetrievalServiceError({ code, message })));

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
            last_fetched_at: '2026-01-03T00:00:00.000Z',
            credentials_expires_at: null,
            last_refresh_failure: null,
            last_refresh_success: null,
            refresh_attempts: null,
            refresh_exhausted: false,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            deleted: false,
            deleted_at: null
        },
        credentials: { type: 'API_KEY', apiKey: 'secret' },
        endUser: null,
        activeLogs: [],
        provider: 'github'
    };
}
