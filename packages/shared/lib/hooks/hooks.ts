import axios from 'axios';
import type { Span, Tracer } from 'dd-trace';
import SyncClient from '../clients/sync.client.js';
import type { ApiKeyCredentials, BasicApiCredentials } from '../models/Auth.js';
import type { RecentlyCreatedConnection, Connection, ConnectionConfig } from '../models/Connection.js';
import type { ApplicationConstructedProxyConfiguration, InternalProxyConfiguration } from '../models/Proxy.js';
import proxyService from '../services/proxy.service.js';
import type { HTTP_VERB } from '../models/Generic.js';
import type { Template as ProviderTemplate } from '../models/Provider.js';
import integrationPostConnectionScript from '../integrations/scripts/connection/connection.manager.js';
import webhookService from '../services/notification/webhook.service.js';
import { SpanTypes } from '../utils/telemetry.js';
import { isCloud, isLocal, isEnterprise } from '../utils/utils.js';
import { Result, resultOk, resultErr } from '../utils/result.js';
import { NangoError } from '../utils/error.js';

export const connectionCreated = async (
    connection: RecentlyCreatedConnection,
    provider: string,
    activityLogId: number | null,
    options: { initiateSync?: boolean; runPostConnectionScript?: boolean } = { initiateSync: true, runPostConnectionScript: true }
): Promise<void> => {
    const hosted = !isCloud() && !isLocal() && !isEnterprise();

    if (options.initiateSync === true && !hosted) {
        const syncClient = await SyncClient.getInstance();
        syncClient?.initiate(connection.id as number);
    }

    if (options.runPostConnectionScript === true) {
        integrationPostConnectionScript(connection, provider);
    }

    await webhookService.sendAuthUpdate(connection, provider, true, activityLogId);
};

export const connectionCreationFailed = async (connection: RecentlyCreatedConnection, provider: string, activityLogId: number | null): Promise<void> => {
    await webhookService.sendAuthUpdate(connection, provider, false, activityLogId);
};

export const connectionTest = async (
    provider: string,
    template: ProviderTemplate,
    credentials: ApiKeyCredentials | BasicApiCredentials,
    connectionId: string,
    providerConfigKey: string,
    environment_id: number,
    connection_config: ConnectionConfig,
    tracer: Tracer
): Promise<Result<boolean, NangoError>> => {
    const providerVerification = template?.proxy?.verification;

    if (!providerVerification) {
        return resultOk(true);
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

    const { method, endpoint } = providerVerification;

    const connection: Connection = {
        id: -1,
        provider_config_key: providerConfigKey,
        connection_id: connectionId,
        credentials,
        connection_config,
        environment_id
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

    const internalConfig: InternalProxyConfiguration = {
        provider,
        connection
    };

    try {
        const { response } = await proxyService.route(configBody, internalConfig);

        if (axios.isAxiosError(response)) {
            span.setTag('nango.error', response);
            const error = new NangoError('connection_test_failed', response, response.response?.status);
            return resultErr(error);
        }

        if (!response) {
            const error = new NangoError('connection_test_failed');
            span.setTag('nango.error', response);
            return resultErr(error);
        }

        if (response.status && (response?.status < 200 || response?.status > 300)) {
            const error = new NangoError('connection_test_failed');
            span.setTag('nango.error', response);
            return resultErr(error);
        }

        return resultOk(true);
    } catch (e) {
        const error = new NangoError('connection_test_failed');
        span.setTag('nango.error', e);
        return resultErr(error);
    } finally {
        span.finish();
    }
};
