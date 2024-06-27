import type { Response } from 'express';
import { errorManager, hmacService } from '@nangohq/shared';
import type { Environment } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';

export async function hmacCheck({
    environment,
    logCtx,
    providerConfigKey,
    connectionId,
    hmac,
    res
}: {
    environment: Environment;
    logCtx: LogContext;
    providerConfigKey: string;
    connectionId: string;
    hmac: string | undefined;
    res: Response;
}) {
    const hmacEnabled = await hmacService.isEnabled(environment.id);
    if (hmacEnabled) {
        if (!hmac) {
            await logCtx.error('Missing HMAC in query params');
            await logCtx.failed();

            errorManager.errRes(res, 'missing_hmac');

            return;
        }
        const verified = await hmacService.verify(hmac, environment.id, providerConfigKey, connectionId);
        if (!verified) {
            await logCtx.error('Invalid HMAC');
            await logCtx.failed();

            errorManager.errRes(res, 'invalid_hmac');

            return;
        }
    }
}
