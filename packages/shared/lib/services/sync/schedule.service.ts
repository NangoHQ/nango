import db, { schema, dbNamespace } from '../../db/database.js';
import { Schedule as SyncSchedule, ScheduleStatus, SyncCommandToScheduleStatus, SyncCommand } from '../../models/Sync.js';
import type { ServiceResponse } from '../../models/Generic.js';
import { getInterval } from '../nango-config.service.js';
import SyncClient from '../../clients/sync.client.js';
import { createActivityLogDatabaseErrorMessageAndEnd } from '../activity/activity.service.js';

const TABLE = dbNamespace + 'sync_schedules';

export const createSchedule = async (sync_id: string, frequency: string, offset: number, status: ScheduleStatus, schedule_id: string): Promise<void> => {
    await db.knex.withSchema(db.schema()).from<SyncSchedule>(TABLE).insert({
        sync_id,
        status,
        schedule_id,
        frequency,
        offset
    });
};

export const getSchedule = async (sync_id: string): Promise<SyncSchedule | null> => {
    const result = await schema().select('*').from<SyncSchedule>(TABLE).where({ sync_id, deleted: false }).first();

    if (result) {
        return result;
    }

    return null;
};

export const getSyncSchedules = async (sync_id: string): Promise<SyncSchedule[]> => {
    const result = await schema().select('*').from<SyncSchedule>(TABLE).where({ sync_id, deleted: false });

    if (Array.isArray(result) && result.length > 0) {
        return result;
    }

    return [];
};

export const deleteScheduleForSync = async (sync_id: string, environmentId: number): Promise<void> => {
    const syncClient = await SyncClient.getInstance();

    const schedule = await getSchedule(sync_id);

    if (schedule && syncClient) {
        await syncClient.deleteSyncSchedule(schedule?.schedule_id as string, environmentId);
    }
};

export const markAllAsStopped = async (): Promise<void> => {
    await schema().update({ status: ScheduleStatus.STOPPED }).from<SyncSchedule>(TABLE);
};

export const updateScheduleStatus = async (schedule_id: string, status: SyncCommand, activityLogId: number): Promise<void> => {
    try {
        await schema().update({ status: SyncCommandToScheduleStatus[status] }).from<SyncSchedule>(TABLE).where({ schedule_id, deleted: false });
    } catch (error: any) {
        await createActivityLogDatabaseErrorMessageAndEnd(
            `Failed to update schedule status to ${status} for schedule_id: ${schedule_id}.`,
            error,
            activityLogId
        );
    }
};

export const updateSyncScheduleFrequency = async (
    sync_id: string,
    interval: string,
    syncName: string,
    activityLogId: number,
    environmentId: number
): Promise<ServiceResponse<boolean>> => {
    const existingSchedule = await getSchedule(sync_id);

    if (!existingSchedule) {
        return { success: true, error: null, response: false };
    }

    const { success, error, response } = getInterval(interval, new Date());

    if (!success || response === null) {
        return { success: false, error, response: null };
    }

    const { interval: frequency, offset } = response;

    if (existingSchedule.frequency !== frequency) {
        await schema().update({ frequency }).from<SyncSchedule>(TABLE).where({ sync_id, deleted: false });
        const syncClient = await SyncClient.getInstance();
        await syncClient?.updateSyncSchedule(existingSchedule.schedule_id, frequency, offset, syncName, activityLogId, environmentId);

        return { success: true, error: null, response: true };
    }

    return { success: true, error: null, response: false };
};

export const deleteSchedulesBySyncId = async (sync_id: string): Promise<void> => {
    await schema().from<SyncSchedule>(TABLE).where({ sync_id, deleted: false }).update({ deleted: true, deleted_at: new Date() });
};
