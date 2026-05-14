import dayjs from 'dayjs';
import tracer from 'dd-trace';

import { records } from '@nangohq/records';
import { cancellableDaemon } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../logger.js';

/*
 * Batch cleanup daemon
 * Deletes records_batch entries older than PERSIST_BATCH_CLEANUP_MAX_AGE_MS.
 * Drops records_seen partitions older than PERSIST_BATCH_CLEANUP_MAX_AGE_MS.
 * Pre-creates tomorrow's records_seen partition on each tick.
 */
export function batchCleanupDaemon(): Awaited<ReturnType<typeof cancellableDaemon>> {
    return cancellableDaemon({
        tickIntervalMs: envs.PERSIST_BATCH_CLEANUP_INTERVAL_MS,
        tick: async (): Promise<void> => {
            return tracer.trace('nango.persist.daemon.batchCleanup', async (span) => {
                try {
                    const olderThan = new Date(Date.now() - envs.PERSIST_BATCH_CLEANUP_MAX_AGE_MS);
                    const batchRes = await records.deleteOldBatchEntries({ olderThan, limit: envs.PERSIST_BATCH_CLEANUP_LIMIT });
                    if (batchRes.isErr()) {
                        span?.addTags({ error: batchRes.error.message });
                        logger.error(`[Batch cleanup] error deleting old batch entries: ${batchRes.error.message}`);
                    } else {
                        span?.addTags({ deleted: batchRes.value });
                    }

                    const ensureRes = await records.ensureSeenPartition({ date: dayjs().add(1, 'day').toDate() });
                    if (ensureRes.isErr()) {
                        span?.addTags({ seenError: ensureRes.error.message });
                        logger.error(`[Batch cleanup] error ensuring seen partition: ${ensureRes.error.message}`);
                    }

                    const seenRes = await records.dropSeenPartition({ date: dayjs(olderThan).subtract(1, 'day').toDate() });
                    if (seenRes.isErr()) {
                        span?.addTags({ seenError: seenRes.error.message });
                        logger.error(`[Batch cleanup] error dropping seen partition: ${seenRes.error.message}`);
                        return;
                    }
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
