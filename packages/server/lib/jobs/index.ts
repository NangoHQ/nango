import * as cron from 'node-cron';
import { isCloud, db, encryptionManager, errorManager, ErrorSourceEnum, logger } from '@nangohq/shared';
import { SpanTypes } from '@nangohq/shared';
import tracer from '../tracer.js';

export async function deleteOldActivityLogs(): Promise<void> {
    /**
     * Delete all activity logs older than 15 days
     */
    cron.schedule('*/1 * * * *', async () => {
        const activityLogTableName = 'nango._nango_activity_logs';
        const span = tracer.startSpan(SpanTypes.JOBS_CLEAN_ACTIVITY_LOGS);
        tracer.scope().activate(span, async () => {
            logger.info('[oldActivity] starting');
            try {
                // Postgres does not allow DELETE LIMIT so we batch ourself to limit the memory footprint of this query.
                await db.knex.raw(
                    `DELETE FROM ${activityLogTableName} WHERE id IN (SELECT id FROM ${activityLogTableName} WHERE created_at < NOW() - interval '15 days' LIMIT 5000)`
                );
            } catch (err: unknown) {
                const e = new Error('failed_to_clean_activity_logs_table', { cause: err instanceof Error ? err.message : err });
                errorManager.report(e, { source: ErrorSourceEnum.PLATFORM }, tracer);
            }

            span.finish();
            logger.info('[oldActivity] done');
        });
    });
}

export async function encryptDataRecords(): Promise<void> {
    if (isCloud()) {
        await encryptionManager.encryptAllDataRecords();
    }
}
