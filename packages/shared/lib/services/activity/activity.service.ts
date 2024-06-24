import db from '@nangohq/database';
import type { ActivityLog, ActivityLogMessage } from '../../models/Activity.js';
import { LogActionEnum } from '../../models/Activity.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';

const activityLogTableName = '_nango_activity_logs';

export type ActivityLogMessagesGrouped = Record<number, ActivityLogMessage[]>;

/**
 * _nango_activity_logs
 * _nango_activity_log_messages
 * @desc Store activity logs for all user facing operations
 *
 * _nango_activity_logs:
 *      index:
 *          - environment_id
 *          - session_id
 *
 * _nango_activity_log_messages:
 *     index:
 *          - environment_id
 *          - activity_log_id: activity_log_id_index
 *          - created_at: created_at_index
 */

export async function createActivityLog(log: ActivityLog): Promise<number | null> {
    if (!log.environment_id) {
        return null;
    }

    try {
        const result: void | Pick<ActivityLog, 'id'> = await db.knex.from<ActivityLog>(activityLogTableName).insert(log, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
            return result[0].id;
        }
    } catch (e) {
        errorManager.report(e, {
            source: ErrorSourceEnum.PLATFORM,
            environmentId: log.environment_id,
            operation: LogActionEnum.DATABASE,
            metadata: {
                log
            }
        });
    }

    return null;
}

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
