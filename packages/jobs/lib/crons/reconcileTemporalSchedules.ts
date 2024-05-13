import * as cron from 'node-cron';
import { telemetry, LogTypes, LogActionEnum, errorManager, ErrorSourceEnum, SyncClient, db, getRunningSchedules } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';

const logger = getLogger('Jobs.TemporalSchedules');

export function reconcileTemporalSchedules(): void {
    cron.schedule('*/30 * * * *', async () => {
        const start = Date.now();
        try {
            await exec();
        } catch (err: unknown) {
            const e = new Error('failed to reconcile temporal schedules');
            e.cause = err instanceof Error ? err.message : err;
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM }, tracer);
        }
        metrics.duration(metrics.Types.RENCONCILE_TEMPORAL_SCHEDULES, Date.now() - start);
    });
}

export async function exec(): Promise<void> {
    logger.info('[reconcileTemporalSchedules] starting');

    const today = new Date();
    const lockKey = parseInt(`2${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}`);

    const syncClient = await SyncClient.getInstance();

    if (!syncClient) {
        logger.error('[reconcileTemporalSchedules] failed to get sync client');
        return;
    }

    await db.knex.transaction(async (trx) => {
        const { rows } = await trx.raw<{ rows: { pg_try_advisory_xact_lock: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?);`, [lockKey]);
        if (!rows?.[0]?.pg_try_advisory_xact_lock) {
            logger.info('[reconcileTemporalSchedules] could not acquire lock, skipping');
            return;
        }

        let lastId = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const runningSchedules = await getRunningSchedules({ limit: 1000, offset: lastId });

            if (runningSchedules.length === 0) {
                logger.info('[reconcileTemporalSchedules] no running schedules found');
                break;
            }

            logger.info(`[reconcileTemporalSchedules] found ${runningSchedules.length} running schedules`);

            for (const schedule of runningSchedules) {
                const { schedule_id, sync_id } = schedule;

                logger.info(`[reconcileTemporalSchedules] reconciling scheduleId: ${schedule_id}, syncId: ${sync_id}`);

                try {
                    const syncSchedule = await syncClient.describeSchedule(schedule_id);

                    if (syncSchedule && syncSchedule.schedule?.state?.paused) {
                        const temporalClient = syncClient.getClient();
                        const scheduleHandle = temporalClient?.schedule.getHandle(schedule_id);

                        if (scheduleHandle && !schedule_id.includes('demo')) {
                            await scheduleHandle.unpause(
                                `reconcileTemporalSchedules cron unpaused the schedule for sync '${sync_id}' at ${new Date().toISOString()}`
                            );
                            await telemetry.log(
                                LogTypes.TEMPORAL_SCHEDULE_MISMATCH_NOT_RUNNING,
                                'CRON: Schedule is marked as paused in temporal but not in the database. The schedule has been unpaused in temporal',
                                LogActionEnum.SYNC,
                                {
                                    sync_id,
                                    schedule_id,
                                    level: 'warn'
                                },
                                `syncId:${sync_id}`
                            );
                        }
                    }
                    metrics.increment(metrics.Types.RENCONCILE_TEMPORAL_SCHEDULES_SUCCESS);
                } catch {
                    logger.error(`[reconcileTemporalSchedules] failed to reconcile scheduleId: ${schedule_id}, syncId: ${sync_id}`);
                    metrics.increment(metrics.Types.RENCONCILE_TEMPORAL_SCHEDULES_FAILED);
                }
            }

            const lastSchedule = runningSchedules[runningSchedules.length - 1];

            if (lastSchedule && typeof lastSchedule.id === 'number' && lastSchedule.id === lastId) {
                break;
            }

            if (lastSchedule && typeof lastSchedule.id === 'number') {
                lastId = lastSchedule.id;
            }
        }
        logger.info('[reconcileTemporalSchedules] ✅ done');
    });
}
