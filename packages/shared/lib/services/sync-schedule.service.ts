import db, { dbNamespace } from '../db/database.js';
import { SyncSchedule, ScheduleStatus } from '../models/SyncSchedule.js';

const TABLE = dbNamespace + 'sync_schedules';

export const create = async (nangoConnectionId: number, schedule_id: string, interval: string): Promise<SyncSchedule | null> => {
    const result: void | Pick<SyncSchedule, 'id'> = await db.knex.withSchema(db.schema()).from<SyncSchedule>(TABLE).insert(
        {
            nango_connection_id: nangoConnectionId,
            schedule_id,
            interval,
            status: ScheduleStatus.RUNNING
        },
        ['id']
    );

    if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
        const statusId = result[0]['id'];

        return statusId;
    }

    return null;
};
