import * as cron from 'node-cron';
import { isCloud, db, encryptionManager } from '@nangohq/shared';

export async function deleteOldActivityLogs(): Promise<void> {
    /**
     * Delete all activity logs older than 15 days
     */
    cron.schedule('*/15 * * * *', async () => {
        const activityLogTableName = '_nango_activity_logs';

        // Postgres do not allow DELETE LIMIT so we batch ourself to limit the memory footprint of this query.
        await db.knex.raw(
            `DELETE FROM ${activityLogTableName} WHERE id IN (SELECT id FROM ${activityLogTableName} WHERE created_at < NOW() - interval '15 days' LIMIT 5000)`
        );
    });
}

export async function encryptDataRecords(): Promise<void> {
    if (isCloud()) {
        await encryptionManager.encryptAllDataRecords();
    }
}
