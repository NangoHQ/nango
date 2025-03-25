import tracer from 'dd-trace';

import {
    AnalyticsTypes,
    CONNECTIONS_WITH_SCRIPTS_CAP_LIMIT,
    NangoError,
    ProxyRequest,
    analytics,
    errorNotificationService,
    externalWebhookService,
    getProxyConfiguration,
    getSyncConfigsWithConnections,
    syncManager
} from '@nangohq/shared';
import { Err, Ok, getLogger, isHosted, report } from '@nangohq/utils';
import { sendAuth as sendAuthWebhook } from '@nangohq/webhooks';

import { getOrchestrator } from '../utils/utils.js';
import executeVerificationScript from './connection/credentials-verification-script.js';
import { slackService } from '../services/slack.js';
import { postConnectionCreation } from './connection/on/connection-created.js';
import postConnection from './connection/post-connection.js';

import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type { ApiKeyCredentials, BasicApiCredentials, Config } from '@nangohq/shared';
import type {
    ApplicationConstructedProxyConfiguration,
    ConnectionConfig,
    DBConnectionDecrypted,
    DBEnvironment,
    DBTeam,
    IntegrationConfig,
    InternalProxyConfiguration,
    JwtCredentials,
    MessageRowInsert,
    Provider,
    RecentlyCreatedConnection,
    RecentlyFailedConnection,
    SignatureCredentials,
    TbaCredentials
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

const logger = getLogger('hooks');
const orchestrator = getOrchestrator();

export const connectionCreationStartCapCheck = async ({
    providerConfigKey,
    environmentId,
    creationType
}: {
    providerConfigKey: string | undefined;
    environmentId: number;
    creationType: 'create' | 'import';
}): Promise<boolean> => {
    if (!providerConfigKey) {
        return false;
    }

    const scriptConfigs = await getSyncConfigsWithConnections(providerConfigKey, environmentId);

    for (const script of scriptConfigs) {
        const { connections } = script;

        if (connections && connections.length >= CONNECTIONS_WITH_SCRIPTS_CAP_LIMIT) {
            logger.info(`Reached cap for providerConfigKey: ${providerConfigKey} and environmentId: ${environmentId}`);
            const analyticsType =
                creationType === 'create' ? AnalyticsTypes.RESOURCE_CAPPED_CONNECTION_CREATED : AnalyticsTypes.RESOURCE_CAPPED_CONNECTION_IMPORTED;
            void analytics.trackByEnvironmentId(analyticsType, environmentId);
            return true;
        }
    }

    return false;
};

export async function testConnectionCredentials({
    config,
    connectionConfig,
    connectionId,
    credentials,
    provider
}: {
    config: Config;
    connectionConfig: ConnectionConfig;
    connectionId: string;
    credentials: ApiKeyCredentials | BasicApiCredentials | TbaCredentials | JwtCredentials | SignatureCredentials;
    provider: Provider;
}): Promise<Result<{ logs: MessageRowInsert[]; tested: boolean }, NangoError>> {
    const logs: MessageRowInsert[] = [
        {
            type: 'log',
            level: 'info',
            message: 'Running automatic credentials verification via verification script',
            createdAt: new Date().toISOString()
        }
    ];

    try {
        if (provider.credentials_verification_script) {
            await executeVerificationScript(config, credentials, connectionId, connectionConfig);
            return Ok({ logs, tested: true });
        }

        if (provider.proxy?.verification) {
            const result = await credentialsTest({
                config,
                provider,
                credentials,
                connectionId,
                connectionConfig
            });
            return result;
        }
        return Ok({ logs: [], tested: false });
    } catch (err) {
        logs.push({
            type: 'log',
            level: 'error',
            message: 'Connection test verification failed',
            createdAt: new Date().toISOString()
        });

        return Err(new NangoError('connection_test_failed', { err, logs }));
    }
}

export const connectionCreated = async (
    createdConnectionPayload: RecentlyCreatedConnection,
    account: DBTeam,
    providerConfig: IntegrationConfig,
    logContextGetter: LogContextGetter,
    options: { initiateSync?: boolean; runPostConnectionScript?: boolean } = { initiateSync: true, runPostConnectionScript: true }
): Promise<void> => {
    const { connection, environment, auth_mode, endUser } = createdConnectionPayload;

    if (options.runPostConnectionScript === true) {
        await postConnection(createdConnectionPayload, providerConfig.provider, logContextGetter);
        await postConnectionCreation(createdConnectionPayload, providerConfig.provider, logContextGetter);
    }

    if (options.initiateSync === true && !isHosted) {
        await syncManager.createSyncForConnection({ connectionId: connection.id, syncVariant: 'base', logContextGetter, orchestrator });
    }

    const webhookSettings = await externalWebhookService.get(environment.id);

    void sendAuthWebhook({
        connection,
        environment,
        webhookSettings,
        auth_mode,
        endUser,
        success: true,
        operation: 'creation',
        providerConfig,
        account
    });
};

export const connectionCreationFailed = async (
    failedConnectionPayload: RecentlyFailedConnection,
    account: DBTeam,
    providerConfig?: IntegrationConfig
): Promise<void> => {
    const { connection, environment, auth_mode, error } = failedConnectionPayload;

    if (error) {
        const webhookSettings = await externalWebhookService.get(environment.id);

        void sendAuthWebhook({
            connection,
            environment,
            webhookSettings,
            auth_mode,
            success: false,
            error,
            operation: 'creation',
            providerConfig,
            account
        });
    }
};

export const connectionRefreshSuccess = async ({
    connection,
    config
}: {
    connection: Pick<DBConnectionDecrypted, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id'>;
    config: IntegrationConfig;
}): Promise<void> => {
    try {
        await errorNotificationService.auth.clear({
            connection_id: connection.id
        });
    } catch (err) {
        report(new Error('refresh_success_hook_failed', { cause: err }), { id: connection.id });
    }

    try {
        await slackService.removeFailingConnection({
            connection,
            name: connection.connection_id,
            type: 'auth',
            originalActivityLogId: null,
            provider: config.provider
        });
    } catch (err) {
        report(new Error('refresh_success_hook_failed', { cause: err }), { id: connection.id });
    }
};

export const connectionRefreshFailed = async ({
    account,
    connection,
    logCtx,
    authError,
    environment,
    provider,
    config,
    action
}: {
    account: DBTeam;
    connection: DBConnectionDecrypted;
    environment: DBEnvironment;
    provider: Provider;
    config: IntegrationConfig;
    authError: { type: string; description: string };
    logCtx: LogContext;
    action: 'token_refresh' | 'connection_test';
}): Promise<void> => {
    try {
        await errorNotificationService.auth.create({
            type: 'auth',
            action,
            connection_id: connection.id,
            log_id: logCtx.id,
            active: true
        });
    } catch (err) {
        report(new Error('refresh_failed_hook_failed', { cause: err }), { id: connection.id });
    }

    const webhookSettings = await externalWebhookService.get(environment.id);
    void sendAuthWebhook({
        connection,
        environment,
        webhookSettings,
        auth_mode: provider.auth_mode,
        operation: 'refresh',
        error: authError,
        success: false,
        providerConfig: config,
        account
    });

    try {
        await slackService.reportFailure({
            account,
            environment,
            connection,
            name: connection.connection_id,
            type: 'auth',
            originalActivityLogId: logCtx.id,
            provider: config.provider
        });
    } catch (err) {
        report(new Error('refresh_failed_hook_failed', { cause: err }), { id: connection.id });
    }
};

export async function credentialsTest({
    config,
    provider,
    credentials,
    connectionId,
    connectionConfig
}: {
    config: Config;
    provider: Provider;
    credentials: ApiKeyCredentials | BasicApiCredentials | TbaCredentials | JwtCredentials | SignatureCredentials;
    connectionId: string;
    connectionConfig: ConnectionConfig;
}): Promise<Result<{ logs: MessageRowInsert[]; tested: boolean }, NangoError>> {
    const providerVerification = provider?.proxy?.verification;

    if (!providerVerification?.endpoints?.length) {
        return Ok({ logs: [], tested: false });
    }

    const active = tracer.scope().active();
    const span = tracer.startSpan('nango.server.hooks.credentialsTest', {
        childOf: active as Span,
        tags: {
            provider: provider,
            providerConfigKey: config.unique_key,
            connectionId: connectionId
        }
    });

    const { method, base_url_override: baseUrlOverride, headers, endpoints } = providerVerification;

    const connection: DBConnectionDecrypted = {
        id: -1,
        end_user_id: null,
        provider_config_key: config.unique_key,
        connection_id: connectionId,
        credentials,
        connection_config: connectionConfig,
        environment_id: config.environment_id,
        created_at: new Date(),
        updated_at: new Date(),
        config_id: -1,
        credentials_iv: null,
        credentials_tag: null,
        deleted: false,
        deleted_at: null,
        last_fetched_at: null,
        metadata: null,
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false
    };

    const logs: MessageRowInsert[] = [
        { type: 'log', level: 'info', message: `Running automatic credentials verification`, createdAt: new Date().toISOString() }
    ];

    const internalConfig: InternalProxyConfiguration = {
        providerName: config.provider
    };

    for (const endpoint of endpoints) {
        const configBody: ApplicationConstructedProxyConfiguration = {
            endpoint,
            method: method ?? 'GET',
            provider,
            providerName: config.provider,
            providerConfigKey: config.unique_key,
            headers: {
                'Content-Type': 'application/json'
            },
            decompress: false
        };

        if (headers) {
            configBody.headers = headers;
        }

        if (baseUrlOverride) {
            configBody.baseUrlOverride = baseUrlOverride;
        }

        try {
            const proxyConfig = getProxyConfiguration({ externalConfig: configBody, internalConfig }).unwrap();
            const proxy = new ProxyRequest({
                logger: (msg) => {
                    logs.push(msg);
                },
                proxyConfig,
                getConnection: () => {
                    return connection;
                }
            });

            const response = (await proxy.request()).unwrap();

            if (response.status && response.status >= 200 && response.status < 300) {
                return Ok({ logs, tested: true });
            }
        } catch {
            // Already covered
        }
    }

    const error = new NangoError('connection_test_failed', { logs });
    span.setTag('error', error);
    span.finish();
    return Err(error);
}
