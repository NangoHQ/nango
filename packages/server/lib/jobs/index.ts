import * as cron from 'node-cron';
import type { ActivityLog } from '@nangohq/shared';
import { isCloud, db, SyncClient, syncOrchestrator } from '@nangohq/shared';

export async function deleteOldActivityLogs(): Promise<void> {
    /**
     * Delete all activity logs older than 15 days
     */
    cron.schedule('0 0 * * *', async () => {
        const activityLogTableName = '_nango_activity_logs';
        await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where('created_at', '<', db.knex.raw("now() - interval '15 days'")).del();
    });
}

export async function deleteStaleSyncs(): Promise<void> {
    if (!isCloud) {
        return;
    }

    const schedules = await db.knex.withSchema(db.schema()).from('_nango_sync_schedules').select('*').where({
        deleted: false
    });

    const syncClient = await SyncClient.getInstance();

    for (const schedule of schedules) {
        const { sync_id, schedule_id } = schedule;
        const scheduleResponse = await syncClient?.describeSchedule(schedule_id);
        if (!scheduleResponse) {
            await syncOrchestrator.deleteSync(sync_id);
        }
    }
}
