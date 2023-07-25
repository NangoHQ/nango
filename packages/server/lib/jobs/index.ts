import * as cron from 'node-cron';
import type { ActivityLog } from '@nangohq/shared';
import { db, isCloud, encryptionManager, deleteScheduleForSync } from '@nangohq/shared';

export async function deleteOldActivityLogs(): Promise<void> {
    /**
     * Delete all activity logs older than 15 days
     */
    cron.schedule('0 0 * * *', async () => {
        const activityLogTableName = '_nango_activity_logs';
        await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where('created_at', '<', db.knex.raw("now() - interval '15 days'")).del();
    });
}

export async function dbCleanup(): Promise<void> {
    if (!isCloud) {
        return;
    }

    const envsToEncrypt = await db.knex.withSchema(db.schema()).from('_nango_environments').where({ secret_key_iv: null, secret_key_tag: null }).select('*');

    if (envsToEncrypt.length > 0) {
        for (const env of envsToEncrypt) {
            await db.knex.withSchema(db.schema()).from('_nango_environments').where({ id: env.id }).update(encryptionManager.encryptEnvironment(env));
        }
    }

    const dupeSyncs = await db.knex
        .withSchema(db.schema())
        .from('_nango_syncs')
        .select('nango_connection_id', 'name')
        .select(db.knex.raw('array_agg(id) as ids'))
        .groupBy('nango_connection_id', 'name')
        .orderBy('nango_connection_id', 'desc')
        .where({ deleted: false })
        .havingRaw('count(*) > 1');

    if (dupeSyncs.length > 0) {
        for (const sync of dupeSyncs) {
            const { ids } = sync;
            const [firstId, ...otherIds] = ids;
            await db.knex.withSchema(db.schema()).from('_nango_sync_jobs').whereIn('sync_id', otherIds).update({ sync_id: firstId });
            for (const id of otherIds) {
                await deleteScheduleForSync(id);
            }
            await db.knex.withSchema(db.schema()).from('_nango_sync_schedules').whereIn('sync_id', otherIds).del();
            await db.knex.withSchema(db.schema()).from('_nango_sync_data_records').whereIn('sync_id', otherIds).update({ sync_id: firstId });
            await db.knex.withSchema(db.schema()).from('_nango_syncs').whereIn('id', otherIds).del();
        }
    }
}
