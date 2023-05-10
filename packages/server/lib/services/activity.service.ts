import db from '../db/database.js';
import type { ActivityLog, ActivityLogMessage } from '../models';

const activityLogTableName = '_nango_activity_logs';
const activityLogMessageTableName = '_nango_activity_log_messages';

export async function createActivityLog(log: ActivityLog): Promise<boolean> {
    const result: void | Pick<ActivityLog, 'id'> = await db.knex
        .withSchema(db.schema())
        .from<ActivityLog>(activityLogTableName)
        .insert(
            {
                ...log
            },
            ['id']
        );

    if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
        return true;
    }

    return false;
}

export async function createActivityLogMessage(logMessage: ActivityLogMessage): Promise<boolean> {
    const result: void | Pick<ActivityLogMessage, 'id'> = await db.knex
        .withSchema(db.schema())
        .from<ActivityLogMessage>(activityLogMessageTableName)
        .insert(
            {
                ...logMessage
            },
            ['id']
        );

    if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
        return true;
    }

    return false;
}
