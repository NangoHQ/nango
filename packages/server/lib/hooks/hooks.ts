import axios from 'axios';
import type { Span } from 'dd-trace';
import {
    CONNECTIONS_WITH_SCRIPTS_CAP_LIMIT,
    NangoError,
    SpanTypes,
    proxyService,
    getSyncConfigsWithConnections,
    analytics,
    errorNotificationService,
    SlackService,
    externalWebhookService,
    AnalyticsTypes,
    syncManager
} from '@nangohq/shared';
import type {
    ApplicationConstructedProxyConfiguration,
    InternalProxyConfiguration,
    ApiKeyCredentials,
    BasicApiCredentials,
    RecentlyCreatedConnection,
    Connection,
    ConnectionConfig,
    RecentlyFailedConnection,
    Config
} from '@nangohq/shared';
import { getLogger, Ok, Err, isHosted } from '@nangohq/utils';
import { getOrchestrator } from '../utils/utils.js';
import type { TbaCredentials, IntegrationConfig, DBEnvironment, Provider, JwtCredentials, SignatureCredentials, MessageRowInsert } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';
import postConnection from './connection/post-connection.js';
import { postConnectionCreation } from './connection/on/connection-created.js';
import { sendAuth as sendAuthWebhook } from '@nangohq/webhooks';
import tracer from 'dd-trace';

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

export const connectionCreated = async (
    createdConnectionPayload: RecentlyCreatedConnection,
    provider: string,
    logContextGetter: LogContextGetter,
    options: { initiateSync?: boolean; runPostConnectionScript?: boolean } = { initiateSync: true, runPostConnectionScript: true },
    logCtx?: LogContext
): Promise<void> => {
    const { connection, environment, auth_mode, endUser } = createdConnectionPayload;

    if (options.runPostConnectionScript === true) {
        await postConnection(createdConnectionPayload, provider, logContextGetter);
        await postConnectionCreation(createdConnectionPayload, provider, logContextGetter);
    }

    if (options.initiateSync === true && !isHosted) {
        await syncManager.createSyncForConnection(connection.id as number, logContextGetter, orchestrator);
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
        provider,
        type: 'auth',
        logCtx
    });
};

export const connectionCreationFailed = async (failedConnectionPayload: RecentlyFailedConnection, provider: string, logCtx?: LogContext): Promise<void> => {
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
            provider,
            type: 'auth',
            logCtx
        });
    }
};

export const connectionRefreshSuccess = async ({
    connection,
    environment,
    config
}: {
    connection: Connection;
    environment: DBEnvironment;
    config: IntegrationConfig;
}): Promise<void> => {
    if (!connection.id) {
        return;
    }

    await errorNotificationService.auth.clear({
        connection_id: connection.id
    });

    const slackNotificationService = new SlackService({ orchestrator, logContextGetter });

    await slackNotificationService.removeFailingConnection({
        connection,
        name: connection.connection_id,
        type: 'auth',
        originalActivityLogId: null,
        environment_id: environment.id,
        provider: config.provider
    });
};

export const connectionRefreshFailed = async ({
    connection,
    logCtx,
    authError,
    environment,
    provider,
    config,
    action
}: {
    connection: Connection;
    environment: DBEnvironment;
    provider: Provider;
    config: IntegrationConfig;
    authError: { type: string; description: string };
    logCtx: LogContext;
    action: 'token_refresh' | 'connection_test';
}): Promise<void> => {
    await errorNotificationService.auth.create({
        type: 'auth',
        action,
        connection_id: connection.id!,
        log_id: logCtx.id,
        active: true
    });

    const webhookSettings = await externalWebhookService.get(environment.id);

    void sendAuthWebhook({
        connection,
        environment,
        webhookSettings,
        auth_mode: provider.auth_mode,
        operation: 'refresh',
        error: authError,
        success: false,
        provider: config.provider,
        type: 'auth',
        logCtx
    });

    const slackNotificationService = new SlackService({ orchestrator, logContextGetter });

    await slackNotificationService.reportFailure(connection, connection.connection_id, 'auth', logCtx.id, environment.id, config.provider);
};

export async function connectionTest({
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
}): Promise<Result<{ logs: MessageRowInsert[] }, NangoError>> {
    const providerVerification = provider?.proxy?.verification;

    if (!providerVerification) {
        return Ok({ logs: [] });
    }

    const active = tracer.scope().active();
    const span = tracer.startSpan(SpanTypes.CONNECTION_TEST, {
        childOf: active as Span,
        tags: {
            'nango.provider': provider,
            'nango.providerConfigKey': config.unique_key,
            'nango.connectionId': connectionId
        }
    });

    const { method, endpoint, base_url_override: baseUrlOverride, headers } = providerVerification;

    const connection: Connection = {
        id: -1,
        end_user_id: null,
        provider_config_key: config.unique_key,
        connection_id: connectionId,
        credentials,
        connection_config: connectionConfig,
        environment_id: config.environment_id,
        created_at: new Date(),
        updated_at: new Date()
    };

    const configBody: ApplicationConstructedProxyConfiguration = {
        endpoint,
        method: method ?? 'GET',
        provider,
        token: credentials,
        providerName: config.provider,
        providerConfigKey: config.unique_key,
        connectionId,
        headers: {
            'Content-Type': 'application/json'
        },
        connection
    };

    if (headers) {
        configBody.headers = headers;
    }

    if (baseUrlOverride) {
        configBody.baseUrlOverride = baseUrlOverride;
    }

    const internalConfig: InternalProxyConfiguration = {
        providerName: config.provider,
        connection
    };

    const logs: MessageRowInsert[] = [
        { type: 'log', level: 'info', message: `Running automatic credentials verification`, createdAt: new Date().toISOString() }
    ];
    try {
        const { response, logs: logsProxy } = await proxyService.route(configBody, internalConfig);

        logs.push(...logsProxy);
        if (axios.isAxiosError(response)) {
            const error = new NangoError('connection_test_failed', { response, logs });
            span.setTag('nango.error', response);
            return Err(error);
        }

        if (!response || response instanceof Error) {
            const error = new NangoError('connection_test_failed', { response, logs });
            span.setTag('nango.error', response);
            return Err(error);
        }

        if (response.status && (response?.status < 200 || response?.status > 300)) {
            const error = new NangoError('connection_test_failed', { response, logs });
            span.setTag('nango.error', response);
            return Err(error);
        }

        return Ok({ logs });
    } catch (err) {
        const error = new NangoError('connection_test_failed', { err, logs });
        span.setTag('nango.error', err);
        return Err(error);
    } finally {
        span.finish();
    }
}
