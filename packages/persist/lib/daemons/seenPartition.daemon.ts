import dayjs from 'dayjs';
import tracer from 'dd-trace';

import { records } from '@nangohq/records';
import { cancellableDaemon } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../logger.js';

/*
 * Seen partition daemon
 * Pre-creates tomorrow's records_seen partition on each tick.
 * Drops records_seen partitions older than PERSIST_SEEN_PARTITION_MAX_AGE_MS.
 */
export function seenPartitionDaemon(): Awaited<ReturnType<typeof cancellableDaemon>> {
    return cancellableDaemon({
        tickIntervalMs: envs.PERSIST_SEEN_PARTITION_INTERVAL_MS,
        tick: async (): Promise<void> => {
            return tracer.trace('nango.persist.daemon.seenPartition', async (span) => {
                try {
                    const olderThan = new Date(Date.now() - envs.PERSIST_SEEN_PARTITION_MAX_AGE_MS);

                    const ensureRes = await records.ensureSeenPartition({ date: dayjs().add(1, 'day').toDate() });
                    if (ensureRes.isErr()) {
                        span?.addTags({ error: ensureRes.error.message });
                        logger.error(`[Seen partition] error ensuring seen partition: ${ensureRes.error.message}`);
                    }

                    const dropRes = await records.dropSeenPartition({ date: dayjs(olderThan).subtract(1, 'day').toDate() });
                    if (dropRes.isErr()) {
                        span?.addTags({ error: dropRes.error.message });
                        logger.error(`[Seen partition] error dropping seen partition: ${dropRes.error.message}`);
                    }
                } catch (err) {
                    span?.addTags({ error: (err as Error).message });
                    logger.error(`[Seen partition] unexpected error: ${(err as Error).message}`);
                } finally {
                    span?.finish();
                }
            });
        }
    });
}
