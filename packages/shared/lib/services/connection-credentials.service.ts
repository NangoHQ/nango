import { logContextGetter } from '@nangohq/logs';
import { Err, Ok } from '@nangohq/utils';

import configService from './config.service.js';
import connectionService from './connection.service.js';
import { refreshOrTestCredentials } from './connections/credentials/refresh.js';

import type { ConnectionWithDetails } from './connection.service.js';
import type { AllAuthCredentials, DBConnectionAsJSONRow, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type GetConnectionErrorCode = 'unknown_provider_config' | 'not_found' | 'invalid_credentials' | 'get_failed';

export interface RetrievedConnection {
    connection: Omit<DBConnectionAsJSONRow, 'credentials'>;
    credentials?: AllAuthCredentials | undefined;
    endUser: ConnectionWithDetails['endUser'];
    activeLogs: ConnectionWithDetails['activeLogs'];
    provider: string;
}

export class GetConnectionError extends Error {
    public readonly code: GetConnectionErrorCode;
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
        code: GetConnectionErrorCode;
        message: string;
        status?: number;
        payload?: Record<string, unknown>;
        connection?: RetrievedConnection | undefined;
        cause?: unknown;
    }) {
        super(message, { cause });
        this.name = 'GetConnectionError';
        this.code = code;
        this.status = status;
        this.payload = payload;
        this.connection = connection;
    }
}

interface ConnectionCredentialDependencies {
    configService: typeof configService;
    connectionService: typeof connectionService;
    refreshOrTestCredentials: typeof refreshOrTestCredentials;
}

type RefreshHooks = Pick<Parameters<typeof refreshOrTestCredentials>[0], 'onRefreshFailed' | 'onRefreshSuccess'>;

const defaultDependencies: ConnectionCredentialDependencies = {
    configService,
    connectionService,
    refreshOrTestCredentials
};

export class ConnectionCredentialsService {
    constructor(private readonly dependencies: ConnectionCredentialDependencies = defaultDependencies) {}

    async get({
        account,
        environment,
        connectionId,
        integrationId,
        onRefreshFailed,
        onRefreshSuccess,
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
    } & RefreshHooks): Promise<Result<RetrievedConnection, GetConnectionError>> {
        try {
            const integration = await this.dependencies.configService.getProviderConfig(integrationId, environment.id);
            if (!integration) {
                return Err(new GetConnectionError({ code: 'unknown_provider_config', message: 'Provider does not exists', status: 400 }));
            }

            const connectionResult = await this.dependencies.connectionService.getConnection(connectionId, integrationId, environment.id);
            if (connectionResult.error || !connectionResult.response) {
                return Err(new GetConnectionError({ code: 'not_found', message: 'Failed to find connection', status: 404, cause: connectionResult.error }));
            }

            const credentialResult = await this.dependencies.refreshOrTestCredentials({
                account,
                environment,
                connection: connectionResult.response,
                integration,
                logContextGetter,
                instantRefresh: forceRefresh,
                onRefreshSuccess,
                onRefreshFailed,
                refreshGithubAppJwtToken
            });

            if (credentialResult.isErr()) {
                const { connection: _connection, ...payload } = credentialResult.error.payload || {};
                const connectionWithDetails = await this.getConnectionDetails({
                    connectionId,
                    integrationId,
                    environmentId: environment.id
                });
                return Err(
                    new GetConnectionError({
                        code: 'invalid_credentials',
                        message: credentialResult.error.message || 'Failed to refresh or test credentials',
                        status: credentialResult.error.status,
                        payload,
                        ...(connectionWithDetails.isOk() ? { connection: toRetrievedConnection(connectionWithDetails.value) } : {}),
                        cause: credentialResult.error
                    })
                );
            }

            const credentials = returnRefreshToken ? credentialResult.value.credentials : withoutOAuthRefreshToken(credentialResult.value.credentials);
            const connectionWithDetails = await this.getConnectionDetails({
                connectionId,
                integrationId,
                environmentId: environment.id
            });
            if (connectionWithDetails.isErr()) {
                return connectionWithDetails;
            }
            return Ok(toRetrievedConnection(connectionWithDetails.value, credentials));
        } catch (err) {
            return Err(new GetConnectionError({ code: 'get_failed', message: 'Failed to get connection', cause: err }));
        }
    }

    private async getConnectionDetails({
        connectionId,
        integrationId,
        environmentId
    }: {
        connectionId: string;
        integrationId: string;
        environmentId: number;
    }): Promise<Result<ConnectionWithDetails, GetConnectionError>> {
        const result = await this.dependencies.connectionService.getConnectionWithDetails({
            connectionId,
            providerConfigKey: integrationId,
            environmentId
        });
        return result.mapError((error) => new GetConnectionError({ code: 'get_failed', message: 'Failed to get connection', cause: error }));
    }
}

export const connectionCredentialsService = new ConnectionCredentialsService();

function toRetrievedConnection(connectionWithDetails: ConnectionWithDetails, credentials?: AllAuthCredentials): RetrievedConnection {
    const { credentials: _storedCredentials, ...connection } = connectionWithDetails.connection;
    return {
        connection,
        ...(credentials ? { credentials } : {}),
        endUser: connectionWithDetails.endUser,
        activeLogs: connectionWithDetails.activeLogs,
        provider: connectionWithDetails.provider
    };
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
