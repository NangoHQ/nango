import * as cron from 'node-cron';
import {
    errorManager,
    ErrorSourceEnum,
    MetricTypes,
    softDeleteSchedules,
    telemetry,
    softDeleteJobs,
    syncDataService,
    db,
    findRecentlyDeletedSync
} from '@nangohq/shared';
import Logger from '@nangohq/utils/dist/logger.js';
import tracer from 'dd-trace';

const { logger } = new Logger('Jobs');

const limitJobs = 1000;
const limitSchedules = 1000;
const limitRecords = 1000;

export function deleteSyncsData(): void {
    /**
     * Clean data from soft deleted syncs.
     * This cron needs to be removed at some point, we need a queue to delete specific provider/connection/sync
     */
    cron.schedule('*/20 * * * *', async () => {
        const start = Date.now();
        try {
            await exec();
        } catch (err: unknown) {
            const e = new Error('failed_to_hard_delete_syncs_data', { cause: err instanceof Error ? err.message : err });
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM }, tracer);
        }
        telemetry.duration(MetricTypes.JOBS_DELETE_SYNCS_DATA, Date.now() - start);
    });
}

export async function exec(): Promise<void> {
    logger.info('[deleteSyncs] starting');

    await db.knex.transaction(async (trx) => {
        // Because it's slow and create deadlocks
        // we need to acquire a Lock that prevents any other duplicate cron to execute the same thing
        const { rows } = await trx.raw<{ rows: { pg_try_advisory_xact_lock: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?);`, [123456789]);
        if (!rows || rows.length <= 0 || rows[0]!.pg_try_advisory_xact_lock === false) {
            logger.info(`[deleteSyncs] could not acquire lock, skipping`);
            return;
        }

        const syncs = await findRecentlyDeletedSync();

        for (const sync of syncs) {
            logger.info(`[deleteSyncs] deleting syncId: ${sync.id}`);

            // Soft delete jobs
            let countJobs = 0;
            do {
                countJobs = await softDeleteJobs({ syncId: sync.id, limit: limitJobs });
                logger.info(`[deleteSyncs] soft deleted ${countJobs} jobs`);
                telemetry.increment(MetricTypes.JOBS_DELETE_SYNCS_DATA_JOBS, countJobs);
            } while (countJobs >= limitJobs);

            // -----
            // Soft delete schedules
            let countSchedules = 0;
            do {
                countSchedules = await softDeleteSchedules({ syncId: sync.id, limit: limitSchedules });
                logger.info(`[deleteSyncs] soft deleted ${countSchedules} schedules`);
                telemetry.increment(MetricTypes.JOBS_DELETE_SYNCS_DATA_SCHEDULES, countSchedules);
            } while (countSchedules >= limitSchedules);

            // ----
            // hard delete records
            const res = await syncDataService.deleteRecordsBySyncId({ syncId: sync.id, limit: limitRecords });
            telemetry.increment(MetricTypes.JOBS_DELETE_SYNCS_DATA_RECORDS, res.totalDeletedRecords);
        }
    });

    logger.info('[deleteSyncs] ✅ done');
}
