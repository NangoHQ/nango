import db, { schema, dbNamespace } from '../db/database.js';
import type { Connection as NangoConnection } from '../models/Connection.js';
import { SyncSchedule, ScheduleStatus } from '../models/SyncSchedule.js';
import { deleteSyncSchedule } from './sync.service.js';

const TABLE = dbNamespace + 'sync_schedules';

export const createSchedule = async (nangoConnectionId: number, schedule_id: string, frequency: string): Promise<SyncSchedule | null> => {
    const result: void | Pick<SyncSchedule, 'id'> = await db.knex.withSchema(db.schema()).from<SyncSchedule>(TABLE).insert(
        {
            nango_connection_id: nangoConnectionId,
            schedule_id,
            frequency,
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

export const getSyncSchedules = async (nangoConnectionId: number): Promise<SyncSchedule[]> => {
    const result = await schema().select('*').from<SyncSchedule>(TABLE).where({ nango_connection_id: nangoConnectionId });

    if (Array.isArray(result) && result.length > 0) {
        return result;
    }

    return [];
};

export const deleteScheduleForConnection = async (connection: NangoConnection): Promise<void> => {
    const schedules = await getSyncSchedules(connection.id as number);

    for (const schedule of schedules) {
        await deleteSyncSchedule(schedule?.schedule_id as string);
    }
};
