import db from '@nangohq/database';

export async function findOldActivities({ retention, limit }: { retention: number; limit: number }): Promise<{ id: number }[]> {
    const q = db.knex
        .queryBuilder()
        .from('_nango_activity_logs')
        .select('id')
        .where(db.knex.raw(`_nango_activity_logs.updated_at <  NOW() - INTERVAL '${retention} days'`))
        .limit(limit);
    const logs: { id: number }[] = await q;

    return logs;
}

export async function deleteLog({ activityLogId }: { activityLogId: number }): Promise<void> {
    await db.knex.from('_nango_activity_logs').where({ id: activityLogId }).del();
}

export async function deleteLogsMessages({ activityLogId, limit }: { activityLogId: number; limit: number }): Promise<number> {
    const del = await db.knex
        .from('_nango_activity_log_messages')
        .whereIn('id', db.knex.queryBuilder().select('id').from('_nango_activity_log_messages').where({ activity_log_id: activityLogId }).limit(limit))
        .del();
    return del;
}
