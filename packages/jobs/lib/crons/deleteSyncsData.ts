import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum, logger, MetricTypes, softDeleteJobs, softDeleteSchedules, telemetry } from '@nangohq/shared';
import tracer from '../tracer.js';
import { deleteRecordsBySyncIdSafe, findSyncsWithDeletableRecords } from '@nangohq/shared/lib/services/sync/data/records.service.js';

const limitJobs = 100;
const limitSchedules = 100;
const limitSyncs = 100;
const limitRecords = 5000;

export async function deleteSyncsData(): Promise<void> {
    /**
     * Clean data from soft deleted syncs.
     */
    cron.schedule('*/1 * * * *', async () => {
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

    // -----
    // Soft delete jobs
    let countJobs = 0;
    do {
        countJobs = await softDeleteJobs(limitJobs);
        logger.info(`[deleteSyncs] soft deleted ${countJobs} jobs`);
    } while (countJobs >= limitJobs);

    // -----
    // Soft delete schedules
    let countSchedules = 0;
    do {
        countSchedules = await softDeleteSchedules(limitSchedules);
        logger.info(`[deleteSyncs] soft deleted ${countSchedules} schedules`);
    } while (countSchedules >= limitSchedules);

    // ----
    // hard delete records
    const syncs = await findSyncsWithDeletableRecords(limitSyncs);
    logger.info(`[deleteSyncs] found ${syncs.length} syncs for records`);
    for (const sync of syncs) {
        logger.info(`[oldActivity] deleting syncId: ${sync.id}`);
        await deleteRecordsBySyncIdSafe(sync.id!, limitRecords);
    }

    logger.info('[deleteSyncs] ✅ done');
}
