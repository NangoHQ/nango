import db from '../../db/database.js';
import { ActivityLog, ActivityLogMessage, LogAction, LogActionEnum } from '../../models/Activity.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';

import logger from '../../logger/console.js';

const activityLogTableName = '_nango_activity_logs';
const activityLogMessageTableName = '_nango_activity_log_messages';

interface ActivityLogMessagesGrouped {
    [logId: number]: ActivityLogMessage[];
}

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
        const result: void | Pick<ActivityLog, 'id'> = await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).insert(log, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
            return result[0].id;
        }
    } catch (e) {
        await errorManager.report(e, {
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

export async function updateProvider(id: number, provider: string): Promise<void> {
    if (!id) {
        return;
    }
    await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id }).update({
        provider
    });
}

export async function updateProviderConfigKey(id: number, provider_config_key: string): Promise<void> {
    if (!id) {
        return;
    }
    await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id }).update({
        provider_config_key
    });
}

export async function updateConnectionId(id: number, connection_id: string): Promise<void> {
    await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id }).update({
        connection_id
    });
}

export async function updateProviderConfigAndConnectionId(id: number, provider_config_key: string, connection_id: string): Promise<void> {
    await updateConnectionId(id, connection_id);
    await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id }).update({
        provider_config_key
    });
}

export async function updateSessionId(id: number, session_id: string): Promise<void> {
    await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id }).update({
        session_id
    });
}

export async function updateSuccess(id: number, success: boolean): Promise<void> {
    if (!id) {
        return;
    }
    await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id }).update({
        success
    });
}

export async function updateEndpoint(id: number, endpoint: string): Promise<void> {
    if (!id) {
        return;
    }
    await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id }).update({
        endpoint
    });
}

export async function updateAction(id: number, action: LogAction): Promise<void> {
    await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id }).update({
        action
    });
}

export async function createActivityLogAndLogMessage(log: ActivityLog, logMessage: ActivityLogMessage): Promise<number | null> {
    const logId = await createActivityLog(log);

    if (logId === null) {
        return null;
    }

    logMessage.activity_log_id = logId;

    await createActivityLogMessage(logMessage);

    return logId;
}

export async function createActivityLogMessage(logMessage: ActivityLogMessage, logToConsole = true): Promise<boolean> {
    if (logToConsole) {
        logger.log(logMessage.level as string, logMessage.content);
    }

    if (!logMessage.activity_log_id) {
        return false;
    }

    try {
        const result: void | Pick<ActivityLogMessage, 'id'> = await db.knex
            .withSchema(db.schema())
            .from<ActivityLogMessage>(activityLogMessageTableName)
            .insert(logMessage, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
            return true;
        }
    } catch (e) {
        errorManager.report(e, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                logMessage
            }
        });
    }

    return false;
}

export async function addEndTime(activity_log_id: number): Promise<void> {
    try {
        await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).where({ id: activity_log_id }).update({
            end: Date.now()
        });
    } catch (e) {
        errorManager.report(e, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                activity_log_id
            }
        });
    }
}

export async function createActivityLogMessageAndEnd(logMessage: ActivityLogMessage): Promise<void> {
    if (!logMessage.activity_log_id) {
        return;
    }
    await createActivityLogMessage(logMessage);
    if (logMessage.activity_log_id !== undefined) {
        await addEndTime(logMessage.activity_log_id);
    }
}

export async function findActivityLogBySession(session_id: string): Promise<number | null> {
    const result = await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).select('id').where({ session_id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0].id;
}

export async function getTopLevelLogByEnvironment(environment_id: number, limit = 20, offset = 0): Promise<ActivityLog[]> {
    const logs = await db.knex
        .withSchema(db.schema())
        .from<ActivityLog>('_nango_activity_logs')
        .where({ environment_id })
        .groupBy('_nango_activity_logs.id')
        .orderBy('_nango_activity_logs.timestamp', 'desc')
        .offset(offset)
        .limit(limit);

    return logs || [];
}

/**
 * Retrieves log messages and organizes them by log ID using raw SQL.
 * @desc Iterates over an array of log IDs, fetching the corresponding log messages
 * from the database and grouping them by log ID using a raw SQL query.
 *
 * @param logIds - An array of log IDs to retrieve messages for.
 * @returns A promise that resolves to an object containing arrays of ActivityLogMessage objects,
 * each keyed by its associated log ID.
 */
export async function getLogMessagesForLogs(logIds: number[], environment_id: number): Promise<ActivityLogMessagesGrouped> {
    if (!logIds.length) {
        return [];
    }

    try {
        const query = `
            SELECT activity_log_id, array_agg(row_to_json(_nango_activity_log_messages.*)) as messages
            FROM nango._nango_activity_log_messages
            WHERE activity_log_id = ANY(?)
            AND environment_id = ${environment_id}
            GROUP BY activity_log_id
        `;

        const result = await db.knex.raw(query, [logIds]);

        const groupedMessages: ActivityLogMessagesGrouped = result.rows.reduce(
            (groups: ActivityLogMessagesGrouped, row: { activity_log_id: number; messages: ActivityLogMessage[] }) => {
                groups[row.activity_log_id] = row.messages.sort(
                    (a, b) => new Date(a.created_at as unknown as string).getTime() - new Date(b.created_at as unknown as string).getTime()
                );
                return groups;
            },
            {}
        );

        return groupedMessages;
    } catch (error) {
        console.error(error);
        return [];
    }
}

export async function createActivityLogDatabaseErrorMessageAndEnd(baseMessage: string, error: any, activityLogId: number, environment_id: number) {
    let errorMessage = baseMessage;

    if ('code' in error) errorMessage += ` Error code: ${error.code}.\n`;
    if ('detail' in error) errorMessage += ` Detail: ${error.detail}.\n`;

    errorMessage += `Error Message: ${error.message}`;

    await createActivityLogMessageAndEnd({
        level: 'error',
        environment_id,
        activity_log_id: activityLogId,
        timestamp: Date.now(),
        content: errorMessage
    });
}
