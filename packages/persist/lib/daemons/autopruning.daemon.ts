import tracer from 'dd-trace';

import db from '@nangohq/database';
import { Cursor, records } from '@nangohq/records';
import { connectionService, getPlan } from '@nangohq/shared';
import { cancellableDaemon, flagHasPlan } from '@nangohq/utils';

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
            return tracer.trace('nango.persist.daemon.autopruning', async (span) => {
                try {
                    const candidate = await records.autoPruningCandidate({ staleAfterMs: envs.PERSIST_AUTO_PRUNING_STALE_AFTER_MS });
                    if (candidate.isErr()) {
                        span?.addTags({ error: candidate.error.message });
                        logger.error(`[Auto-pruning] error getting candidate: ${candidate.error.message}`);
                        return;
                    }
                    if (!candidate.value) {
                        span?.addTags({ pruned: 0, candidate: 'none_found' });
                        return;
                    }
                    const connection = await connectionService.getConnectionById(candidate.value.connectionId);
                    if (!connection) {
                        span?.addTags({ error: `Connection ${candidate.value.connectionId} not found` });
                        logger.error(`[Auto-pruning] connection ${candidate.value.connectionId} not found`);
                        return;
                    }
                    span?.addTags({ environmentId: connection.environment_id, candidate: candidate.value });

                    if (flagHasPlan) {
                        const plan = await getPlan(db.knex, { environmentId: connection.environment_id });
                        if (plan.isErr()) {
                            span?.addTags({ error: `Failed to get plan: ${plan.error.message}` });
                            logger.error(`[Auto-pruning] failed to get plan: ${plan.error.message}`);
                            return;
                        }
                        if (!plan.value.has_records_autopruning) {
                            span?.addTags({ pruned: 0, has_records_autopruning: false });
                            logger.info(`[Auto-pruning] skipping pruning as feature not in plan for account: ${plan.value.account_id}`);
                            return;
                        }
                    }

                    const res = await records.deleteRecords({
                        environmentId: connection.environment_id,
                        connectionId: candidate.value.connectionId,
                        model: candidate.value.model,
                        mode: 'prune',
                        toCursorIncluded: candidate.value.cursor,
                        limit: envs.PERSIST_AUTO_PRUNING_LIMIT
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
