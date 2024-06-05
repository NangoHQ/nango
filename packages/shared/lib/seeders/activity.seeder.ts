import type { LogContext } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';

export const createActivityLogSeed = async (environmentId: number): Promise<LogContext> => {
    const logCtx = await logContextGetter.create(
        { operation: { type: 'sync', action: 'init' }, message: 'test' },
        { account: { id: 1, name: '' }, environment: { id: environmentId, name: 'dev' } },
        { dryRun: true, logToConsole: false }
    );

    return logCtx;
};
