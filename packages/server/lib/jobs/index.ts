import * as cron from 'node-cron';
import type { ActivityLog } from '../models';
import db from '../db/database.js';

export async function deleteOldActivityLogs(): Promise<void> {
    /**
     * Delete all activity logs older than 15 days
     */
    cron.schedule('0 0 * * *', async () => {
        const activityLogTableName = '_nango_activity_logs';
        await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where('created_at', '<', db.knex.raw("now() - interval '15 days'")).del();
    });
}
