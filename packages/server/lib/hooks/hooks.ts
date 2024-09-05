import axios from 'axios';
import type { Span, Tracer } from 'dd-trace';
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
    HTTP_VERB,
    RecentlyFailedConnection
} from '@nangohq/shared';
import { getLogger, Ok, Err, isHosted } from '@nangohq/utils';
import { getOrchestrator } from '../utils/utils.js';
import type { TbaCredentials, IntegrationConfig, Template as ProviderTemplate, DBEnvironment } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';
import postConnection from './connection/post-connection.js';
import { externalPostConnection } from './connection/external-post-connection.js';
import { sendAuth as sendAuthWebhook } from '@nangohq/webhooks';

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
    const { connection, environment, auth_mode } = createdConnectionPayload;

    if (options.initiateSync === true && !isHosted) {
        await syncManager.createSyncForConnection(connection.id as number, logContextGetter, orchestrator);
    }

    if (options.runPostConnectionScript === true) {
        await postConnection(createdConnectionPayload, provider, logContextGetter);
        await externalPostConnection(createdConnectionPayload, provider, logContextGetter);
    }

    const webhookSettings = await externalWebhookService.get(environment.id);

    void sendAuthWebhook({
        connection,
        environment,
        webhookSettings,
        auth_mode,
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
    template,
    config
}: {
    connection: Connection;
    environment: DBEnvironment;
    template: ProviderTemplate;
    config: IntegrationConfig;
    authError: { type: string; description: string };
    logCtx: LogContext;
}): Promise<void> => {
    await errorNotificationService.auth.create({
        type: 'auth',
        action: 'token_refresh',
        connection_id: connection.id!,
        log_id: logCtx.id,
        active: true
    });

    const webhookSettings = await externalWebhookService.get(environment.id);

    void sendAuthWebhook({
        connection,
        environment,
        webhookSettings,
        auth_mode: template.auth_mode,
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

export const connectionTest = async (
    provider: string,
    template: ProviderTemplate,
    credentials: ApiKeyCredentials | BasicApiCredentials | TbaCredentials,
    connectionId: string,
    providerConfigKey: string,
    environment_id: number,
    connection_config: ConnectionConfig,
    tracer: Tracer
): Promise<Result<boolean, NangoError>> => {
    const providerVerification = template?.proxy?.verification;

    if (!providerVerification) {
        return Ok(true);
    }

    const active = tracer.scope().active();
    const span = tracer.startSpan(SpanTypes.CONNECTION_TEST, {
        childOf: active as Span,
        tags: {
            'nango.provider': provider,
            'nango.providerConfigKey': providerConfigKey,
            'nango.connectionId': connectionId
        }
    });

    const { method, endpoint, base_url_override: baseUrlOverride, headers } = providerVerification;

    const connection: Connection = {
        id: -1,
        provider_config_key: providerConfigKey,
        connection_id: connectionId,
        credentials,
        connection_config,
        environment_id,
        created_at: new Date(),
        updated_at: new Date()
    };

    const configBody: ApplicationConstructedProxyConfiguration = {
        endpoint,
        method: method?.toUpperCase() as HTTP_VERB,
        template,
        token: credentials,
        provider: provider,
        providerConfigKey,
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
        provider,
        connection
    };

    try {
        const { response } = await proxyService.route(configBody, internalConfig);

        if (axios.isAxiosError(response)) {
            span.setTag('nango.error', response);
            const error = new NangoError('connection_test_failed', response, response.response?.status);
            return Err(error);
        }

        if (!response || response instanceof Error) {
            const error = new NangoError('connection_test_failed');
            span.setTag('nango.error', response);
            return Err(error);
        }

        if (response.status && (response?.status < 200 || response?.status > 300)) {
            const error = new NangoError('connection_test_failed');
            span.setTag('nango.error', response);
            return Err(error);
        }

        return Ok(true);
    } catch (e) {
        const error = new NangoError('connection_test_failed');
        span.setTag('nango.error', e);
        return Err(error);
    } finally {
        span.finish();
    }
};
