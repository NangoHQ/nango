import db, { schema, dbNamespace } from '../../db/database.js';
import type { Connection as NangoConnection } from '../../models/Connection.js';
import type { Schedule as SyncSchedule, ScheduleStatus } from '../../models/Sync.js';
import { getSyncsByConnectionId } from '../sync/sync.service.js';
import SyncClient from '../../clients/sync.client.js';

const TABLE = dbNamespace + 'sync_schedules';

export const createSchedule = async (sync_id: string, frequency: string, status: ScheduleStatus, schedule_id: string): Promise<void> => {
    await db.knex.withSchema(db.schema()).from<SyncSchedule>(TABLE).insert({
        sync_id,
        status,
        schedule_id,
        frequency
    });
};

export const getSchedule = async (sync_id: string): Promise<SyncSchedule | null> => {
    const result = await schema().select('*').from<SyncSchedule>(TABLE).where({ sync_id }).first();

    if (result) {
        return result;
    }

    return null;
};

export const getSyncSchedules = async (sync_id: string): Promise<SyncSchedule[]> => {
    const result = await schema().select('*').from<SyncSchedule>(TABLE).where({ sync_id });

    if (Array.isArray(result) && result.length > 0) {
        return result;
    }

    return [];
};

export const deleteScheduleForConnection = async (connection: NangoConnection): Promise<void> => {
    const syncs = await getSyncsByConnectionId(connection.id as number);

    if (!syncs) {
        return;
    }

    const syncClient = await SyncClient.getInstance();

    for (const sync of syncs) {
        const schedule = await getSchedule(sync.id as string);

        if (schedule) {
            await syncClient.deleteSyncSchedule(schedule?.schedule_id as string);
        }
    }
};
