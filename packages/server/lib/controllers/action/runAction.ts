import { errorManager } from '@nangohq/shared';

import { executeAction } from '../../services/action.service.js';

import type { ActionExecutionErrorCode } from '../../services/action.service.js';
import type { LogContextOrigin } from '@nangohq/logs';
import type { DBEnvironment, DBTeam } from '@nangohq/types';
import type { Span } from 'dd-trace';
import type { Response } from 'express';

const httpErrors: Record<Exclude<ActionExecutionErrorCode, 'action_failed'>, { status: number; code: string }> = {
    unknown_connection: { status: 400, code: 'unknown_connection' },
    unknown_provider: { status: 400, code: 'unknown_provider' },
    unknown_action: { status: 404, code: 'not_found' },
    disabled_action: { status: 404, code: 'disabled_resource' },
    internal_error: { status: 500, code: 'internal_server_error' }
};

/**
 * HTTP adapter over `executeAction`, shared between the public trigger endpoint and the
 * internal session-authenticated trigger function endpoint.
 *
 * Returns the created `LogContextOrigin` so callers can attach additional metadata
 * (e.g. enrichOperation) in their own finally blocks.
 */
export async function runAction({
    account,
    environment,
    connectionId,
    providerConfigKey,
    actionName,
    input,
    isAsync,
    retryMax,
    res,
    span
}: {
    account: DBTeam;
    environment: DBEnvironment;
    connectionId: string;
    providerConfigKey: string;
    actionName: string;
    input?: unknown;
    isAsync: boolean;
    retryMax: number;
    res: Response;
    span: Span;
}): Promise<LogContextOrigin | undefined> {
    const { logCtx, result } = await executeAction({
        account,
        environment,
        connectionId,
        providerConfigKey,
        actionName,
        input,
        isAsync,
        retryMax,
        span
    });

    if (result.isOk()) {
        if ('statusUrl' in result.value) {
            res.status(202).location(result.value.statusUrl).json(result.value);
        } else {
            res.status(200).json(result.value.data);
        }
        return logCtx;
    }

    if (result.error.code === 'action_failed') {
        errorManager.errResFromNangoErr(res, result.error.nangoError ?? null);
        return logCtx;
    }

    const { status, code } = httpErrors[result.error.code];
    res.status(status).send({ error: { code, message: result.error.message } });

    return logCtx;
}
