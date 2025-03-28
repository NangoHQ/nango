import tracer from 'dd-trace';

import { getLocking } from '@nangohq/kvstore';
import { getProvider } from '@nangohq/providers';
import { Err, Ok, getLogger, metrics } from '@nangohq/utils';

import providerClient from '../../../clients/provider.client.js';
import { NangoError } from '../../../utils/error.js';
import { isTokenExpired } from '../../../utils/utils.js';
import connectionService from '../../connection.service.js';
import { REFRESH_MARGIN_S, getExpiresAtFromCredentials } from '../utils.js';

import type { Config } from '../../../models';
import type { Config as ProviderConfig } from '../../../models/index.js';
import type { NangoInternalError } from '../../../utils/error.js';
import type { Lock } from '@nangohq/kvstore';
import type { LogContext, LogContextGetter, LogContextStateless } from '@nangohq/logs';
import type {
    ConnectionConfig,
    DBConnectionDecrypted,
    DBEnvironment,
    DBTeam,
    IntegrationConfig,
    Provider,
    RefreshableCredentials,
    RefreshableProvider,
    TestableCredentials,
    TestableProvider
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

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
              logCtx: LogContextStateless;
          }) => Promise<Result<{ tested: boolean }, NangoError>>)
        | undefined;
}

const logger = getLogger('connectionRefresh');

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

        // TODO: remove this when cron is using other columns
        await connectionService.updateLastFetched(props.connection.id);

        // short-circuit if we know the refresh will fail
        // we can't return an error because it would a breaking change in GET /connection
        if (props.connection.refresh_exhausted && !props.instantRefresh) {
            return Ok(props.connection);
        }

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

        if (res.isErr()) {
            span.setTag('error', res.error);
            await connectionService.setRefreshFailure({
                id: props.connection.id,
                lastRefreshFailure: props.connection.last_refresh_failure,
                currentAttempt: props.connection.refresh_attempts || 0
            });
            return res;
        }

        let newConnection = res.value;
        // Backfill
        // Connections that were created before adding the new columns do not have `credentials_expires_at` or `last_refresh_success`
        // And because some connection will never refresh we are backfilling those information based on what we have
        if (
            !newConnection.credentials_expires_at ||
            newConnection.credentials_expires_at.getTime() < Date.now() ||
            (!newConnection.last_refresh_success && !newConnection.last_refresh_failure)
        ) {
            newConnection = await connectionService.updateConnection({
                ...newConnection,
                last_fetched_at: new Date(),
                credentials_expires_at: getExpiresAtFromCredentials(newConnection.credentials),
                last_refresh_success: new Date(),
                last_refresh_failure: null,
                refresh_attempts: null,
                refresh_exhausted: false
            });
        }

        return Ok(newConnection);
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
    const logsBuffer = logContextGetter.getBuffer({ accountId: account.id });
    const refreshRes = await refreshCredentialsIfNeeded({
        connectionId: oldConnection.connection_id,
        environmentId: environment.id,
        providerConfig: integration as ProviderConfig,
        provider: provider,
        environment_id: environment.id,
        instantRefresh,
        logCtx: logsBuffer
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
        logCtx.merge(logsBuffer);

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

    const logsBuffer = logContextGetter.getBuffer({ accountId: account.id });
    const result = await connectionTestHook({
        config: integration as ProviderConfig,
        provider,
        connectionConfig: oldConnection.connection_config,
        connectionId: oldConnection.connection_id,
        credentials: oldConnection.credentials as TestableCredentials,
        logCtx: logsBuffer
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
        logCtx.merge(logsBuffer);

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

        const connection = await connectionService.updateConnection({
            ...oldConnection,
            last_fetched_at: new Date(),
            credentials_expires_at: getExpiresAtFromCredentials(oldConnection.credentials),
            last_refresh_failure: null,
            last_refresh_success: new Date(),
            refresh_attempts: null,
            refresh_exhausted: false,
            updated_at: new Date()
        });
        return Ok(connection);
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
    instantRefresh = false,
    logCtx
}: {
    connectionId: string;
    environmentId: number;
    providerConfig: ProviderConfig;
    provider: RefreshableProvider;
    environment_id: number;
    instantRefresh?: boolean;
    logCtx: LogContextStateless;
}): Promise<Result<{ connection: DBConnectionDecrypted; refreshed: boolean; credentials: RefreshableCredentials }, NangoInternalError>> {
    const providerConfigKey = providerConfig.unique_key;
    const locking = await getLocking();

    // fetch connection and return credentials if they are fresh
    const getConnectionAndFreshCredentials = async (): Promise<{
        connection: DBConnectionDecrypted;
        shouldRefresh: { should: boolean; reason: string };
        freshCredentials: RefreshableCredentials | null;
    }> => {
        const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

        if (!success || !connection) {
            throw error as NangoError;
        }

        const shouldRefresh = await shouldRefreshCredentials({
            connection,
            credentials: connection.credentials as RefreshableCredentials,
            providerConfig,
            provider,
            instantRefresh
        });

        return {
            connection,
            shouldRefresh,
            freshCredentials: shouldRefresh.should ? null : (connection.credentials as RefreshableCredentials)
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
            const { connection, freshCredentials, shouldRefresh } = await getConnectionAndFreshCredentials();
            if (freshCredentials) {
                return Ok({ connection, refreshed: false, credentials: freshCredentials });
            }

            logger.info('Refreshing', connection.id, 'because', shouldRefresh.reason);
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

        const {
            success,
            error,
            response: newCredentials
        } = await connectionService.getNewCredentials({ connection: connectionToRefresh, providerConfig, provider, logCtx });
        if (!success || !newCredentials) {
            return Err(error!);
        }

        connectionToRefresh.credentials = newCredentials;
        connectionToRefresh = await connectionService.updateConnection({
            ...connectionToRefresh,
            last_fetched_at: new Date(),
            credentials_expires_at: getExpiresAtFromCredentials(newCredentials),
            last_refresh_failure: null,
            last_refresh_success: new Date(),
            refresh_attempts: null,
            refresh_exhausted: false,
            updated_at: new Date()
        });

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
export async function shouldRefreshCredentials({
    connection,
    credentials,
    providerConfig,
    provider,
    instantRefresh
}: {
    connection: DBConnectionDecrypted;
    credentials: RefreshableCredentials;
    providerConfig: ProviderConfig;
    provider: RefreshableProvider;
    instantRefresh: boolean;
}): Promise<{ should: boolean; reason: string }> {
    if (!instantRefresh) {
        if (providerClient.shouldIntrospectToken(providerConfig.provider)) {
            if (await providerClient.introspectedTokenExpired(providerConfig, connection)) {
                return { should: true, reason: 'expired_introspected_token' };
            }
            return { should: false, reason: 'fresh_introspected_token' };
        }

        if (!credentials.expires_at) {
            return { should: false, reason: 'no_expires_at' };
        } else if (!isTokenExpired(credentials.expires_at, provider.token_expiration_buffer || REFRESH_MARGIN_S)) {
            return { should: false, reason: 'fresh' };
        }
    }

    // -- At this stage credentials need a refresh whether it's forced or because they are expired

    if (providerConfig.provider === 'facebook') {
        return { should: instantRefresh, reason: 'facebook' };
    }

    if (credentials.type === 'OAUTH2') {
        if (credentials.refresh_token) {
            return { should: true, reason: 'expired_oauth2_with_refresh_token' };
        }
        // We can't refresh since we don't have a refresh token even if we force it
        return { should: false, reason: 'expired_oauth2_no_refresh_token' };
    }

    if (instantRefresh) {
        return { should: true, reason: 'instant_refresh' };
    }

    return { should: true, reason: 'expired' };
}
