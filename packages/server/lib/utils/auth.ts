import { getConnectionConfig } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import type { RequestLocals } from './express.js';
import type { LogContext } from '@nangohq/logs';
import type { ApiError, ConnectionConfig, ConnectSession, IntegrationConfig } from '@nangohq/types';
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

export async function isIntegrationAllowed({
    config,
    logCtx,
    res
}: {
    config: IntegrationConfig;
    logCtx: LogContext;
    res: Response<ApiError<'integration_not_allowed'>, Required<RequestLocals>>;
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
