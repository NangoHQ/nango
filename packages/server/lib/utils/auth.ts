import type { LogContext } from '@nangohq/logs';
import type { ApiError, IntegrationConfig } from '@nangohq/types';

import type { Response } from 'express';
import type { RequestLocals } from './express';
import { zodErrorToHTTP } from '@nangohq/utils';

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

    await logCtx.error('Integration not allowed by this token', { integration: config.unique_key, allowed: session.allowedIntegrations });
    await logCtx.failed();
    res.status(400).send({ error: { code: 'integration_not_allowed' } });
    return false;
}

export function errorRestrictConnectionId(res: Response<ApiError<'invalid_query_params'>>): void {
    res.status(400).send({
        error: {
            code: 'invalid_query_params',
            errors: zodErrorToHTTP({
                issues: [{ code: 'custom', path: ['connection_id'], message: 'connection_id is forbidden when using session token' }]
            })
        }
    });
}
