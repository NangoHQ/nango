import { logContextGetter } from '@nangohq/logs';
import { configService, connectionService, refreshOrTestCredentials } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionRefreshFailed, connectionRefreshSuccess } from '../hooks/hooks.js';

import type { AllAuthCredentials, DBConnectionAsJSONRow, DBEndUser, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type GetConnectionServiceErrorCode = 'unknown_provider_config' | 'not_found' | 'invalid_credentials' | 'get_failed';

export interface RetrievedConnection {
    connection: Omit<DBConnectionAsJSONRow, 'credentials'>;
    credentials?: AllAuthCredentials | undefined;
    endUser: DBEndUser | null;
    activeLogs: { type: string; log_id: string }[];
    provider: string;
}

export class ConnectionRetrievalServiceError extends Error {
    public readonly code: GetConnectionServiceErrorCode;
    public readonly status: number;
    public readonly payload: Record<string, unknown>;
    public readonly connection?: RetrievedConnection | undefined;

    constructor({
        code,
        message,
        status = 500,
        payload = {},
        connection,
        cause
    }: {
        code: GetConnectionServiceErrorCode;
        message: string;
        status?: number;
        payload?: Record<string, unknown>;
        connection?: RetrievedConnection | undefined;
        cause?: unknown;
    }) {
        super(message, { cause });
        this.name = 'ConnectionRetrievalServiceError';
        this.code = code;
        this.status = status;
        this.payload = payload;
        this.connection = connection;
    }
}

export interface ConnectionRetrievalDependencies {
    configService: typeof configService;
    connectionService: typeof connectionService;
    refreshOrTestCredentials: typeof refreshOrTestCredentials;
}

const defaultDependencies: ConnectionRetrievalDependencies = {
    configService,
    connectionService,
    refreshOrTestCredentials
};

export class ConnectionRetrievalService {
    constructor(private readonly dependencies: ConnectionRetrievalDependencies = defaultDependencies) {}

    async get({
        account,
        environment,
        connectionId,
        integrationId,
        forceRefresh = false,
        returnRefreshToken = false,
        refreshGithubAppJwtToken = false
    }: {
        account: DBTeam;
        environment: DBEnvironment;
        connectionId: string;
        integrationId: string;
        forceRefresh?: boolean;
        returnRefreshToken?: boolean;
        refreshGithubAppJwtToken?: boolean;
    }): Promise<Result<RetrievedConnection, ConnectionRetrievalServiceError>> {
        const integration = await this.dependencies.configService.getProviderConfig(integrationId, environment.id);
        if (!integration) {
            return Err(
                new ConnectionRetrievalServiceError({
                    code: 'unknown_provider_config',
                    message: 'Provider does not exists',
                    status: 400
                })
            );
        }

        const connectionResult = await this.dependencies.connectionService.getConnection(connectionId, integrationId, environment.id);
        if (connectionResult.error || !connectionResult.response) {
            return Err(
                new ConnectionRetrievalServiceError({
                    code: 'not_found',
                    message: 'Failed to find connection',
                    status: 404
                })
            );
        }

        const credentialResult = await this.dependencies.refreshOrTestCredentials({
            account,
            environment,
            connection: connectionResult.response,
            integration,
            logContextGetter,
            instantRefresh: forceRefresh,
            onRefreshSuccess: connectionRefreshSuccess,
            onRefreshFailed: connectionRefreshFailed,
            refreshGithubAppJwtToken
        });

        if (credentialResult.isErr()) {
            const { connection: _connection, ...payload } = credentialResult.error.payload || {};
            const enrichedConnection = await this.getEnrichedConnection({ environmentId: environment.id, connectionId, integrationId });
            return Err(
                new ConnectionRetrievalServiceError({
                    code: 'invalid_credentials',
                    message: credentialResult.error.message || 'Failed to refresh or test credentials',
                    status: credentialResult.error.status,
                    payload,
                    ...(enrichedConnection.isOk() ? { connection: enrichedConnection.value } : {}),
                    cause: credentialResult.error
                })
            );
        }

        const credentials = returnRefreshToken ? credentialResult.value.credentials : withoutOAuthRefreshToken(credentialResult.value.credentials);
        return await this.getEnrichedConnection({ environmentId: environment.id, connectionId, integrationId, credentials });
    }

    private async getEnrichedConnection({
        environmentId,
        connectionId,
        integrationId,
        credentials
    }: {
        environmentId: number;
        connectionId: string;
        integrationId: string;
        credentials?: AllAuthCredentials | undefined;
    }): Promise<Result<RetrievedConnection, ConnectionRetrievalServiceError>> {
        try {
            const connections = await this.dependencies.connectionService.listConnections({
                environmentId,
                connectionId,
                integrationIds: [integrationId]
            });
            const result = connections[0];
            if (connections.length !== 1 || !result) {
                return Err(new ConnectionRetrievalServiceError({ code: 'get_failed', message: 'Failed to get connection' }));
            }

            const { credentials: _encryptedCredentials, ...connection } = result.connection;
            return Ok({
                connection,
                ...(credentials ? { credentials } : {}),
                endUser: result.end_user,
                activeLogs: result.active_logs,
                provider: result.provider
            });
        } catch (err) {
            return Err(new ConnectionRetrievalServiceError({ code: 'get_failed', message: 'Failed to get connection', cause: err }));
        }
    }
}

function withoutOAuthRefreshToken(credentials: AllAuthCredentials): AllAuthCredentials {
    if (credentials.type !== 'OAUTH2') {
        return credentials;
    }

    const { refresh_token: _refreshToken, ...credentialsWithoutRefreshToken } = credentials;
    const raw = credentials.raw;
    if (!raw || !('refresh_token' in raw)) {
        return credentialsWithoutRefreshToken as AllAuthCredentials;
    }

    const { refresh_token: _rawRefreshToken, ...rawWithoutRefreshToken } = raw;
    return { ...credentialsWithoutRefreshToken, raw: rawWithoutRefreshToken } as AllAuthCredentials;
}

export default new ConnectionRetrievalService();
