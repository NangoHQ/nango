import * as cron from 'node-cron';
import db from '@nangohq/database';
import { errorManager, ErrorSourceEnum, hardDeleteJobs, findRecentlyDeletedSync, Orchestrator } from '@nangohq/shared';
import { records } from '@nangohq/records';
import { getLogger, metrics } from '@nangohq/utils';
import { orchestratorClient } from '../clients.js';

const logger = getLogger('Jobs');

const limitJobs = 1000;
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

            logger.info('[deleteSyncs] ✅ done');
        } catch (err) {
            const e = new Error('failed_to_hard_delete_syncs_data', { cause: err instanceof Error ? err.message : err });
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM });
        }
        metrics.duration(metrics.Types.JOBS_DELETE_SYNCS_DATA, Date.now() - start);
    });
}

export async function exec(): Promise<void> {
    logger.info('[deleteSyncs] starting');

    // Because it's slow and create deadlocks
    // we need to acquire a Lock that prevents any other duplicate cron to execute the same thing
    const { rows } = await db.knex.raw<{ rows: { delete_syncs: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?) as delete_syncs`, [123456789]);
    if (!rows || rows.length <= 0 || !rows[0]!.delete_syncs) {
        logger.info(`[deleteSyncs] could not acquire lock, skipping`);
        return;
    }

    const syncs = await findRecentlyDeletedSync();

    const orchestrator = new Orchestrator(orchestratorClient);

    for (const sync of syncs) {
        logger.info(`[deleteSyncs] deleting syncId: ${sync.id}`);

        // hard delete jobs
        let countJobs = 0;
        do {
            countJobs = await hardDeleteJobs({ syncId: sync.id, limit: limitJobs });
            logger.info(`[deleteSyncs] soft deleted ${countJobs} jobs`);
            metrics.increment(metrics.Types.JOBS_DELETE_SYNCS_DATA_JOBS, countJobs);
        } while (countJobs >= limitJobs);

        // -----
        // Soft delete schedules
        const resSchedule = await orchestrator.deleteSync({ syncId: sync.id, environmentId: sync.environmentId });
        const deletedScheduleCount = resSchedule.isErr() ? 1 : 0;
        logger.info(`[deleteSyncs] soft deleted ${deletedScheduleCount} schedules`);
        metrics.increment(metrics.Types.JOBS_DELETE_SYNCS_DATA_SCHEDULES, deletedScheduleCount);

        // ----
        // hard delete records
        let deletedRecords = 0;
        for (const model of sync.models) {
            const res = await records.deleteRecordsBySyncId({
                connectionId: sync.connectionId,
                environmentId: sync.environmentId,
                model,
                syncId: sync.id,
                limit: limitRecords
            });
            deletedRecords += res.totalDeletedRecords;
        }
        metrics.increment(metrics.Types.JOBS_DELETE_SYNCS_DATA_RECORDS, deletedRecords);
    }
}
