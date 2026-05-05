import tracer from 'dd-trace';

import { records } from '@nangohq/records';
import { cancellableDaemon } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../logger.js';

/*
 * Batch cleanup daemon
 * Deletes records_batch entries older than PERSIST_BATCH_CLEANUP_MAX_AGE_MS.
 */
export function batchCleanupDaemon(): Awaited<ReturnType<typeof cancellableDaemon>> {
    return cancellableDaemon({
        tickIntervalMs: envs.PERSIST_BATCH_CLEANUP_INTERVAL_MS,
        tick: async (): Promise<void> => {
            return tracer.trace('nango.persist.daemon.batchCleanup', async (span) => {
                try {
                    const olderThan = new Date(Date.now() - envs.PERSIST_BATCH_CLEANUP_MAX_AGE_MS);
                    const res = await records.deleteOldBatchEntries({ olderThan, limit: envs.PERSIST_BATCH_CLEANUP_LIMIT });
                    if (res.isErr()) {
                        span?.addTags({ error: res.error.message });
                        logger.error(`[Batch cleanup] error deleting old batch entries: ${res.error.message}`);
                        return;
                    }
                    span?.addTags({ deleted: res.value });
                } catch (err) {
                    span?.addTags({ error: (err as Error).message });
                    logger.error(`[Batch cleanup] unexpected error: ${(err as Error).message}`);
                } finally {
                    span?.finish();
                }
            });
        }
    });
}
