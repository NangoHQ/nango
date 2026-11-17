import { connectionService, getConnectionConfig } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import type { RequestLocals } from './express.js';
import type { LogContext } from '@nangohq/logs';
import type { ApiError, ConnectionConfig, ConnectSession, DBConnection, IntegrationConfig } from '@nangohq/types';
import type { Response } from 'express';

/**
 * Merges connection config from the session defaults with the request params.
 */
export function resolveConnectionConfig({
    params,
    connectSession,
    providerConfigKey
}: {
    params: Record<string, any> | undefined;
    connectSession: ConnectSession | undefined;
    providerConfigKey: string;
}): ConnectionConfig {
    const connectionConfig: ConnectionConfig = params ? getConnectionConfig(params) : {};

    const defaults = connectSession?.integrationsConfigDefaults?.[providerConfigKey]?.connectionConfig;
    if (defaults) {
        Object.assign(connectionConfig, defaults);
    }

    return connectionConfig;
}

// Set by each auth flow for the flow itself, so a stored value must never outlive it
const flowOwnedConnectionConfigKeys = new Set(['pending', 'pendingLog', 'overrideTokenRefresh', 'oauth_scopes']);

export function withStoredConnectionConfig(storedConnectionConfig: ConnectionConfig | null | undefined, connectionConfig: ConnectionConfig): ConnectionConfig {
    const kept = Object.entries(storedConnectionConfig ?? {}).filter(([key]) => !flowOwnedConnectionConfigKeys.has(key));
    return { ...Object.fromEntries(kept), ...connectionConfig };
}

export async function getReconnectedConnection(connectSession: ConnectSession | undefined): Promise<DBConnection | null> {
    if (!connectSession?.connectionId) {
        return null;
    }
    return await connectionService.getConnectionById(connectSession.connectionId);
}

export function resolveOutboundWebhookUrlOverride({ connectSession }: { connectSession: ConnectSession | undefined }): string | null {
    const webhookUrl = connectSession?.webhookUrlOverride;
    if (typeof webhookUrl !== 'string' || webhookUrl.trim() === '') {
        return null;
    }
    return webhookUrl;
}

export async function isIntegrationAllowed({
    config,
    logCtx,
    res
}: {
    config: IntegrationConfig;
    logCtx: LogContext;
    res: Response<ApiError<'integration_not_allowed'>, RequestLocals>;
}): Promise<boolean> {
    if (res.locals['authType'] !== 'connectSession') {
        return true;
    }

    const session = res.locals['connectSession'];
    if (!session.allowedIntegrations || session.allowedIntegrations.includes(config.unique_key)) {
        return true;
    }

    void logCtx.error('Integration not allowed by this token', { integration: config.unique_key, allowed: session.allowedIntegrations });
    await logCtx.failed();
    res.status(400).send({ error: { code: 'integration_not_allowed' } });
    return false;
}

export function errorRestrictConnectionId(res: Response<ApiError<'invalid_query_params'>>): void {
    res.status(400).send({
        error: {
            code: 'invalid_query_params',
            errors: zodErrorToHTTP({
                issues: [{ code: 'custom', path: ['connection_id'], message: 'connection_id is forbidden when using session token', input: {} }]
            })
        }
    });
}
