import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type {
    ConnectionConfig,
    DBConnectionDecrypted,
    DBEnvironment,
    DBTeam,
    IntegrationConfig,
    MessageRowInsert,
    Provider,
    RefreshableCredentials,
    RefreshableProvider,
    TestableCredentials,
    TestableProvider
} from '@nangohq/types';
import type { Config } from '../../../models';
import type { Result } from '@nangohq/utils';
import { Err, metrics, Ok } from '@nangohq/utils';
import { NangoError } from '../../../utils/error.js';
import { getProvider } from '@nangohq/providers';
import type { Config as ProviderConfig } from '../../../models/index.js';
import tracer from 'dd-trace';
import type { Lock } from '@nangohq/kvstore';
import { getLocking } from '@nangohq/kvstore';
import connectionService from '../../connection.service.js';
import providerClient from '../../../clients/provider.client.js';
import { isTokenExpired } from '../../../utils/utils.js';

interface RefreshProps {
    account: DBTeam;
    environment: DBEnvironment;
    connection: DBConnectionDecrypted;
    integration: IntegrationConfig;
    logContextGetter: LogContextGetter;
    instantRefresh: boolean;
    onRefreshSuccess: (args: { connection: DBConnectionDecrypted; environment: DBEnvironment; config: ProviderConfig }) => Promise<void>;
    onRefreshFailed: (args: {
        connection: DBConnectionDecrypted;
        logCtx: LogContext;
        authError: { type: string; description: string };
        environment: DBEnvironment;
        provider: Provider;
        config: ProviderConfig;
        account: DBTeam;
        action: 'token_refresh' | 'connection_test';
    }) => Promise<void>;
    connectionTestHook?:
        | ((args: {
              config: Config;
              provider: Provider;
              credentials: TestableCredentials;
              connectionId: string;
              connectionConfig: ConnectionConfig;
          }) => Promise<Result<{ logs: MessageRowInsert[]; tested: boolean }, NangoError>>)
        | undefined;
}

const REFRESH_MARGIN_S = 15 * 60;

/**
 * Take a connection and try to refresh or test based on it's type
 * If instantRefresh === false, we will not refresh if not necessary
 */
export async function refreshOrTestCredentials(props: RefreshProps): Promise<Result<DBConnectionDecrypted, NangoError>> {
    return await tracer.trace('nango.connection.refreshCredentials', async (span) => {
        const provider = getProvider(props.integration.provider);
        if (!provider) {
            const error = new NangoError('unknown_provider_config');
            return Err(error);
        }

        if (!props.connection.credentials || 'encrypted_credentials' in props.connection.credentials) {
            return Err(new NangoError('invalid_crypted_connection'));
        }

        span.setTag('connectionId', props.connection.connection_id).setTag('authType', props.connection.credentials.type);

        let res: Result<DBConnectionDecrypted, NangoError>;
        switch (props.connection.credentials.type) {
            case 'OAUTH2':
            case 'APP':
            case 'OAUTH2_CC':
            case 'TABLEAU':
            case 'JWT':
            case 'BILL':
            case 'TWO_STEP':
            case 'SIGNATURE': {
                res = await refreshCredentials(props, provider as RefreshableProvider);
                break;
            }
            case 'BASIC':
            case 'API_KEY':
            case 'TBA': {
                res = await testCredentials(props, provider as TestableProvider);
                break;
            }
            case 'APP_STORE':
            case 'CUSTOM':
            case 'OAUTH1':
            case undefined: {
                metrics.increment(metrics.Types.REFRESH_CONNECTIONS_UNKNOWN);
                res = Ok(props.connection);
                break;
            }
            default: {
                throw new Error('Unsupported credentials type');
            }
        }

        // TODO: remove this
        await connectionService.updateLastFetched(props.connection.id);

        if (res.isErr()) {
            span.setTag('error', res.error);
            return res;
        }
        return Ok(res.value);
    });
}

/**
 * Try refreshing credentials,
 * only relevant for some providers that have refresh_token (and alike)
 */
async function refreshCredentials(
    { environment, integration, account, connection: oldConnection, instantRefresh, logContextGetter, onRefreshFailed, onRefreshSuccess }: RefreshProps,
    provider: RefreshableProvider
): Promise<Result<DBConnectionDecrypted, NangoError>> {
    const refreshRes = await refreshCredentialsIfNeeded({
        connectionId: oldConnection.connection_id,
        environmentId: environment.id,
        providerConfig: integration as ProviderConfig,
        provider: provider,
        environment_id: environment.id,
        instantRefresh
    });

    if (refreshRes.isErr()) {
        const err = refreshRes.error;
        const logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'refresh_token' } },
            {
                account,
                environment,
                integration: integration ? { id: integration.id!, name: integration.unique_key, provider: integration.provider } : undefined,
                connection: { id: oldConnection.id, name: oldConnection.connection_id }
            }
        );

        metrics.increment(metrics.Types.REFRESH_CONNECTIONS_FAILED);
        void logCtx.error('Failed to refresh credentials', err);
        await logCtx.failed();

        await onRefreshFailed({
            connection: oldConnection,
            logCtx,
            authError: {
                type: err.type,
                description: err.message
            },
            environment,
            provider,
            account,
            config: integration as ProviderConfig,
            action: 'token_refresh'
        });

        const { credentials, ...connectionWithoutCredentials } = oldConnection;
        const errorWithPayload = new NangoError(err.type, { connection: connectionWithoutCredentials });

        return Err(errorWithPayload);
    }

    const value = refreshRes.value;
    if (value.refreshed) {
        metrics.increment(metrics.Types.REFRESH_CONNECTIONS_SUCCESS);
        await onRefreshSuccess({
            connection: value.connection,
            environment,
            config: integration as ProviderConfig
        });
    } else {
        metrics.increment(metrics.Types.REFRESH_CONNECTIONS_FRESH);
    }

    return Ok(value.connection);
}

/**
 * Try testing credentials,
 * only relevant for some providers that have free-form credentials
 */
async function testCredentials(
    { account, integration, environment, connection: oldConnection, logContextGetter, connectionTestHook, onRefreshFailed, onRefreshSuccess }: RefreshProps,
    provider: TestableProvider
): Promise<Result<DBConnectionDecrypted, NangoError>> {
    if (!connectionTestHook) {
        return Ok(oldConnection);
    }

    const result = await connectionTestHook({
        config: integration as ProviderConfig,
        provider,
        connectionConfig: oldConnection.connection_config,
        connectionId: oldConnection.connection_id,
        credentials: oldConnection.credentials as TestableCredentials
    });

    if (result.isErr()) {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'connection_test' } },
            {
                account,
                environment,
                integration: integration ? { id: integration.id!, name: integration.unique_key, provider: integration.provider } : undefined,
                connection: { id: oldConnection.id, name: oldConnection.connection_id }
            }
        );
        if ('logs' in result.error.payload) {
            await Promise.all(
                (result.error.payload['logs'] as MessageRowInsert[]).map(async (log) => {
                    await logCtx.log(log);
                })
            );
        }

        void logCtx.error('Failed to verify connection', result.error);
        await logCtx.failed();

        metrics.increment(metrics.Types.REFRESH_CONNECTIONS_FAILED);
        await onRefreshFailed({
            connection: oldConnection,
            logCtx,
            authError: {
                type: result.error.type,
                description: result.error.message
            },
            environment,
            provider,
            account,
            config: integration as ProviderConfig,
            action: 'connection_test'
        });

        const { credentials, ...connectionWithoutCredentials } = oldConnection;
        const errorWithPayload = new NangoError(result.error.type, connectionWithoutCredentials);

        return Err(errorWithPayload);
    }

    if (result.value.tested) {
        metrics.increment(metrics.Types.REFRESH_CONNECTIONS_SUCCESS);
        await onRefreshSuccess({
            connection: oldConnection,
            environment,
            config: integration as ProviderConfig
        });
    } else {
        metrics.increment(metrics.Types.REFRESH_CONNECTIONS_UNKNOWN);
    }

    return Ok(oldConnection);
}

async function refreshCredentialsIfNeeded({
    connectionId,
    environmentId,
    providerConfig,
    provider,
    environment_id,
    instantRefresh = false
}: {
    connectionId: string;
    environmentId: number;
    providerConfig: ProviderConfig;
    provider: RefreshableProvider;
    environment_id: number;
    instantRefresh?: boolean;
}): Promise<Result<{ connection: DBConnectionDecrypted; refreshed: boolean; credentials: RefreshableCredentials }, NangoError>> {
    const providerConfigKey = providerConfig.unique_key;
    const locking = await getLocking();

    // fetch connection and return credentials if they are fresh
    const getConnectionAndFreshCredentials = async (): Promise<{
        connection: DBConnectionDecrypted;
        freshCredentials: RefreshableCredentials | null;
    }> => {
        const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

        if (!success || !connection) {
            throw error as NangoError;
        }

        const shouldRefresh = await shouldRefreshCredentials(
            connection,
            connection.credentials as RefreshableCredentials,
            providerConfig,
            provider,
            instantRefresh
        );

        return {
            connection,
            freshCredentials: shouldRefresh ? null : (connection.credentials as RefreshableCredentials)
        };
    };

    // We must ensure that only one refresh is running at a time
    // Using a simple redis entry as a lock with a TTL to ensure it is always released.
    // NOTES:
    // - This is not a distributed lock and will not work in a multi-redis environment.
    // - It could also be unsafe in case of a Redis crash.
    let lock: Lock | null = null;
    try {
        const ttlInMs = 10000;
        const acquisitionTimeoutMs = ttlInMs * 1.2; // giving some extra time for the lock to be released

        let connectionToRefresh: DBConnectionDecrypted;
        try {
            const lockKey = `lock:refresh:${environment_id}:${providerConfigKey}:${connectionId}`;
            lock = await locking.tryAcquire(lockKey, ttlInMs, acquisitionTimeoutMs);
            // Another refresh was running so we check if the credentials were refreshed
            // If yes, we return the new credentials
            // If not, we proceed with the refresh
            const { connection, freshCredentials } = await getConnectionAndFreshCredentials();
            if (freshCredentials) {
                return Ok({ connection, refreshed: false, credentials: freshCredentials });
            }
            connectionToRefresh = connection;
        } catch (err) {
            // lock acquisition might have timed out
            // but refresh might have been successfully performed by another execution
            // while we were waiting for the lock
            // so we check if the credentials were refreshed
            // if yes, we return the new credentials
            // if not, we actually fail the refresh
            const { connection, freshCredentials } = await getConnectionAndFreshCredentials();
            if (freshCredentials) {
                return Ok({ connection, refreshed: false, credentials: freshCredentials });
            }
            throw err;
        }

        const { success, error, response: newCredentials } = await connectionService.getNewCredentials(connectionToRefresh, providerConfig, provider);
        if (!success || !newCredentials) {
            return Err(error!);
        }

        connectionToRefresh.credentials = newCredentials;
        connectionToRefresh = await connectionService.updateConnection({ ...connectionToRefresh, updated_at: new Date() });

        return Ok({ connection: connectionToRefresh, refreshed: true, credentials: newCredentials });
    } catch (err) {
        const error = new NangoError('refresh_token_external_error', { message: err instanceof Error ? err.message : 'unknown error' });

        return Err(error);
    } finally {
        if (lock) {
            await locking.release(lock);
        }
    }
}

/**
 * Determine if a credentials should be refreshed
 */
async function shouldRefreshCredentials(
    connection: DBConnectionDecrypted,
    credentials: RefreshableCredentials,
    providerConfig: ProviderConfig,
    provider: RefreshableProvider,
    instantRefresh: boolean
): Promise<boolean> {
    const refreshCondition =
        instantRefresh ||
        (providerClient.shouldIntrospectToken(providerConfig.provider) && (await providerClient.introspectedTokenExpired(providerConfig, connection)));

    let tokenExpirationCondition =
        refreshCondition || (credentials.expires_at && isTokenExpired(credentials.expires_at, provider.token_expiration_buffer || REFRESH_MARGIN_S));

    if (credentials.type === 'OAUTH2' && providerConfig.provider !== 'facebook') {
        tokenExpirationCondition = Boolean(credentials.refresh_token && tokenExpirationCondition);
    }

    return Boolean(tokenExpirationCondition);
}
