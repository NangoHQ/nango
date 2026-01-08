import tracer from 'dd-trace';

import { Cursor, records } from '@nangohq/records';
import { isSyncStale } from '@nangohq/shared';
import { cancellableDaemon } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../logger.js';

/*
 * Auto-deleting daemon
 * This daemon runs in a loop and hard-delete records for syncs that haven't run in a defined stale period
 * Each tick, a candidate connection/model is selected for deletion
 * The candidate's associated sync is then checked to ensure it is stale
 * Only a limited number of records are deleted per tick to avoid overwhelming the database
 * We rely on the daemon to run periodically on each persist instance to continue deleting records
 */
export function autoDeletingDaemon(): Awaited<ReturnType<typeof cancellableDaemon>> {
    return cancellableDaemon({
        tickIntervalMs: envs.PERSIST_AUTO_DELETING_INTERVAL_MS,
        tick: async (): Promise<void> => {
            const dryRun = true; // TODO: removed after grace period given to customer (March 8th 2026)
            return tracer.trace('nango.persist.daemon.autodeleting', { tags: { dryRun } }, async (span) => {
                try {
                    const candidate = await records.autoDeletingCandidate({ staleAfterMs: envs.PERSIST_AUTO_DELETING_STALE_AFTER_MS });
                    if (candidate.isErr()) {
                        span?.addTags({ error: candidate.error.message });
                        logger.error(`[Auto-deleting] error getting candidate: ${candidate.error.message}`);
                        return;
                    }
                    if (!candidate.value) {
                        span?.addTags({ deleted: 0, candidate: 'none_found' });
                        return;
                    }
                    span?.addTags({ candidate: candidate.value });

                    const isStale = await isSyncStale({
                        connectionId: candidate.value.connectionId,
                        model: candidate.value.model,
                        staleAfterMs: envs.PERSIST_AUTO_DELETING_STALE_AFTER_MS
                    });
                    if (isStale.isErr()) {
                        span?.addTags({ error: isStale.error.message });
                        logger.error(`[Auto-deleting] error checking if sync is stale: ${isStale.error.message}`);
                        return;
                    }

                    if (!isStale.value) {
                        span?.addTags({ skipped: 'candidate_not_stale' });
                        return;
                    }

                    const res = await records.deleteRecords({
                        environmentId: candidate.value.environmentId,
                        connectionId: candidate.value.connectionId,
                        model: candidate.value.model,
                        mode: 'hard',
                        limit: envs.PERSIST_AUTO_DELETING_LIMIT,
                        dryRun
                    });
                    if (res.isErr()) {
                        span?.addTags({ error: res.error.message });
                        logger.error(`[Auto-deleting] error deleting records: ${res.error.message}`);
                        return;
                    }
                    // lag: how far behind are we from the desired deleting point
                    // high lag means we are not keeping up with deleting
                    let lagMs: number | null = null;
                    if (res.value.lastCursor) {
                        const cursorSort = Cursor.from(res.value.lastCursor)?.sort;
                        if (cursorSort) {
                            const cursorDate = new Date(cursorSort);
                            lagMs = Date.now() - cursorDate.getTime() - envs.PERSIST_AUTO_DELETING_STALE_AFTER_MS;
                        }
                    }
                    span?.addTags({
                        deleted: res.value.count,
                        ...(lagMs ? { lagMs } : {})
                    });
                } catch (err) {
                    span?.addTags({ error: (err as Error).message });
                    logger.error(`[Auto-deleting] unexpected error: ${(err as Error).message}`);
                } finally {
                    span?.finish();
                }
            });
        }
    });
}
