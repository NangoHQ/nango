import db from '../../db/database.js';
import { ActivityLog, ActivityLogMessage, LogAction, LogActionEnum } from '../../models/Activity.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';

import logger from '../../logger/console.js';

const activityLogTableName = '_nango_activity_logs';
const activityLogMessageTableName = '_nango_activity_log_messages';

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
        const result: void | Pick<ActivityLog, 'id'> = await db.knex.withSchema(db.schema()).from<ActivityLog>(activityLogTableName).insert(log, ['id']);

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

export async function updateSuccess(id: number, success: boolean | null): Promise<void> {
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

export async function getTopLevelLogByEnvironment(
    environment_id: number,
    limit = 20,
    offset = 0,
    {
        status,
        script,
        connection,
        integration,
        date
    }: {
        status?: string | undefined;
        script?: string | undefined;
        connection?: string | undefined;
        integration?: string | undefined;
        date?: string | undefined;
    }
): Promise<ActivityLog[]> {
    const logs = db.knex
        .withSchema(db.schema())
        .from<ActivityLog>('_nango_activity_logs')
        .where({ environment_id })
        .groupBy('_nango_activity_logs.id')
        .orderBy('_nango_activity_logs.timestamp', 'desc')
        .offset(offset)
        .limit(limit);

    if (status === 'success' || status === 'failure') {
        logs.where({ success: status === 'success' });
    }

    if (status === 'in_progress') {
        logs.where({ success: null });
    }

    if (script) {
        logs.where({ operation_name: script });
    }

    if (connection) {
        logs.where({ connection_id: connection });
    }

    if (integration) {
        logs.where({ provider_config_key: integration });
    }

    if (date) {
        const dateObj = new Date(date);
        const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0'); // Add leading zero if needed
        const day = dateObj.getUTCDate().toString().padStart(2, '0'); // Add leading zero if needed
        const formattedDate = `${month}/${day}/${dateObj.getUTCFullYear()}`;
        logs.whereRaw("date_trunc('day', to_timestamp(_nango_activity_logs.timestamp / 1000)) = ?", [formattedDate]);
    }

    await logs.select('_nango_activity_logs.*');

    return logs || [];
}

export async function activityFilter(environment_id: number, filterColumn: 'connection_id' | 'provider'): Promise<string[]> {
    const logsQuery = db.knex
        .withSchema(db.schema())
        .from<ActivityLog>('_nango_activity_logs')
        .where({ environment_id })
        .whereNotNull(filterColumn)
        .groupBy(filterColumn)
        .select(filterColumn)
        .orderBy(filterColumn, 'asc');

    const logs = await logsQuery;

    const distinctValues: string[] = logs
        .map((log: { [key: string]: string }) => log[filterColumn] as string)
        .filter((value: string | undefined): value is string => typeof value === 'string');

    return distinctValues;
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
    try {
        const limit = 1000;

        // Rank Partition will create one group per activity_log_id
        // and allow us to ORDER with a GROUP by and add a "pseudo limit"
        const query = `
        SELECT
            *
        FROM (
            SELECT
                *,
                RANK() OVER (PARTITION BY activity_log_id ORDER BY created_at DESC) AS rank
            FROM
                nango._nango_activity_log_messages) AS partition
        WHERE
            activity_log_id IN (${logIds.map(() => '?').join(',')})
            AND environment_id = ${environment_id}
            AND partition.rank <= ${limit};`;

        const result = await db.knex.raw<{ rows: ActivityLogMessage[] }>(query, logIds);

        const groupedMessages: ActivityLogMessagesGrouped = {};
        for (const row of result.rows) {
            if (typeof groupedMessages[row.activity_log_id!] === 'undefined') {
                groupedMessages[row.activity_log_id!] = [];
            }

            groupedMessages[row.activity_log_id!]!.push(row);
        }

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
