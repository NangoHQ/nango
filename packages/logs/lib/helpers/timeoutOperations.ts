import { envs } from '../env.js';
import { setTimeoutForAll } from '../models/messages.js';
import { logger } from '../utils.js';

export async function timeoutOperations(): Promise<void> {
    if (!envs.NANGO_LOGS_ENABLED) {
        return;
    }

    try {
        logger.info(`Timeouting old operations...`);
        await setTimeoutForAll();
    } catch (err: unknown) {
        throw new Error('failed_to_timeout_old_operations', { cause: err instanceof Error ? err.message : err });
    }
}
