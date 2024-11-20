import type { Response } from 'express';
import { errorManager, hmacService } from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import type { DBEnvironment } from '@nangohq/types';

export async function hmacCheck({
    environment,
    logCtx,
    providerConfigKey,
    connectionId,
    hmac,
    res
}: {
    environment: DBEnvironment;
    logCtx: LogContext;
    providerConfigKey: string;
    connectionId: string | undefined;
    hmac?: string | undefined;
    res: Response;
}): Promise<boolean> {
    if (!environment.hmac_enabled) {
        return true;
    }

    if (!hmac) {
        await logCtx.error('Missing HMAC in query params');
        await logCtx.failed();

        errorManager.errRes(res, 'missing_hmac');

        return false;
    }

    const verified = hmacService.verify({ receivedDigest: hmac, environment, values: [providerConfigKey, ...(connectionId ? [connectionId] : [])] });
    if (!verified) {
        await logCtx.error('Invalid HMAC');
        await logCtx.failed();

        errorManager.errRes(res, 'invalid_hmac');

        return false;
    }

    return true;
}
