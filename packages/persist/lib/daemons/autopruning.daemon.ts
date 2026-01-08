import tracer from 'dd-trace';

import { Cursor, records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { cancellableDaemon } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../logger.js';

/*
 * Auto-pruning daemon
 * This daemon runs in a loop and prunes old records from the database based on the defined stale period
 * each tick, a candidate connection/model is selected for pruning
 * If a candidate is found, records older than the stale period are pruned
 * Only a limited number of records are pruned per tick to avoid overwhelming the database
 * We rely on the daemon to run periodically on each persist instance to continue pruning old records
 */
export function autoPruningDaemon(): Awaited<ReturnType<typeof cancellableDaemon>> {
    return cancellableDaemon({
        tickIntervalMs: envs.PERSIST_AUTO_PRUNING_INTERVAL_MS,
        tick: async (): Promise<void> => {
            const dryRun = true; // TODO: removed after grace period given to customer (Feb 8th 2026)
            return tracer.trace('nango.persist.daemon.autopruning', { tags: { dryRun } }, async (span) => {
                try {
                    const candidate = await records.autoPruningCandidate({ staleAfterMs: envs.PERSIST_AUTO_PRUNING_STALE_AFTER_MS });
                    if (candidate.isErr()) {
                        span?.addTags({ error: candidate.error.message });
                        logger.error(`[Auto-pruning] error getting candidate: ${candidate.error.message}`);
                        return;
                    }
                    if (candidate.value) {
                        const connection = await connectionService.getConnectionById(candidate.value.connectionId);
                        if (!connection) {
                            span?.addTags({ error: `Connection ${candidate.value.connectionId} not found` });
                            logger.error(`[Auto-pruning] connection ${candidate.value.connectionId} not found`);
                            return;
                        }
                        span?.addTags({ environmentId: connection.environment_id, candidate: candidate.value });

                        const res = await records.deleteRecords({
                            environmentId: connection.environment_id,
                            connectionId: candidate.value.connectionId,
                            model: candidate.value.model,
                            mode: 'prune',
                            toCursorIncluded: candidate.value.cursor,
                            limit: envs.PERSIST_AUTO_PRUNING_LIMIT,
                            dryRun
                        });
                        if (res.isErr()) {
                            span?.addTags({ error: res.error.message });
                            logger.error(`[Auto-pruning] error pruning records: ${res.error.message}`);
                            return;
                        }
                        // lag: how far behind are we from the desired pruning point
                        // high lag means we are not keeping up with pruning
                        let lagMs: number | null = null;
                        if (res.value.lastCursor) {
                            const cursorSort = Cursor.from(res.value.lastCursor)?.sort;
                            if (cursorSort) {
                                const cursorDate = new Date(cursorSort);
                                lagMs = Date.now() - cursorDate.getTime() - envs.PERSIST_AUTO_PRUNING_STALE_AFTER_MS;
                            }
                        }
                        span?.addTags({
                            pruned: res.value.count,
                            ...(lagMs ? { lagMs } : {})
                        });
                    }
                    span?.addTags({ pruned: 0, candidate: 'none_found' });
                } catch (err) {
                    logger.error(`[Auto-pruning] unexpected error: ${(err as Error).message}`);
                    span?.addTags({ error: (err as Error).message });
                    return;
                } finally {
                    span?.finish();
                }
            });
        }
    });
}
