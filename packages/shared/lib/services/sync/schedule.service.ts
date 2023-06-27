import db, { schema, dbNamespace } from '../../db/database.js';
import type { Connection as NangoConnection } from '../../models/Connection.js';
import { Schedule as SyncSchedule, ScheduleStatus, SyncCommandToScheduleStatus, SyncCommand } from '../../models/Sync.js';
import { getSyncsByConnectionId, getSyncsByProviderConfigKey } from '../sync/sync.service.js';
import { getInterval } from '../nango-config.service.js';
import SyncClient from '../../clients/sync.client.js';
import { createActivityLogMessageAndEnd } from '../activity.service.js';

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

export const deleteScheduleForSync = async (sync_id: string): Promise<void> => {
    const syncClient = await SyncClient.getInstance();

    const schedule = await getSchedule(sync_id);

    if (schedule && syncClient) {
        await syncClient.deleteSyncSchedule(schedule?.schedule_id as string);
    }
};

export const deleteScheduleForConnection = async (connection: NangoConnection): Promise<void> => {
    const syncs = await getSyncsByConnectionId(connection.id as number);

    if (!syncs) {
        return;
    }

    const syncClient = await SyncClient.getInstance();

    for (const sync of syncs) {
        const schedule = await getSchedule(sync.id as string);

        if (schedule && syncClient) {
            await syncClient.deleteSyncSchedule(schedule?.schedule_id as string);
        }
    }
};

export const deleteScheduleForProviderConfig = async (accountId: number, providerConfigKey: string): Promise<void> => {
    const syncs = await getSyncsByProviderConfigKey(accountId, providerConfigKey);

    if (!syncs) {
        return;
    }

    const syncClient = await SyncClient.getInstance();

    for (const sync of syncs) {
        const schedule = await getSchedule(sync.id as string);

        if (schedule && syncClient) {
            await syncClient.deleteSyncSchedule(schedule?.schedule_id as string);
        }
    }
};

export const markAllAsStopped = async (): Promise<void> => {
    await schema().update({ status: ScheduleStatus.STOPPED }).from<SyncSchedule>(TABLE);
};

export const updateScheduleStatus = async (schedule_id: string, status: SyncCommand, activityLogId: number): Promise<void> => {
    try {
        await schema().update({ status: SyncCommandToScheduleStatus[status] }).from<SyncSchedule>(TABLE).where({ schedule_id });
    } catch (error: any) {
        let errorMessage = `Failed to update schedule status to ${status} for schedule_id: ${schedule_id}.\n`;

        if ('code' in error) errorMessage += `Error code: ${error.code}.\n`;
        if ('detail' in error) errorMessage += `Detail: ${error.detail}.\n`;

        errorMessage += `Error Message: ${error.message}`;

        await createActivityLogMessageAndEnd({
            level: 'error',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: errorMessage
        });
    }
};

export const updateSyncScheduleFrequency = async (sync_id: string, interval: string): Promise<void> => {
    const existingSchedule = await getSchedule(sync_id);
    const { interval: frequency, offset } = getInterval(interval, new Date());

    if (!existingSchedule) {
        return;
    }

    if (existingSchedule.frequency !== frequency) {
        await schema().update({ frequency }).from<SyncSchedule>(TABLE).where({ sync_id });
        const syncClient = await SyncClient.getInstance();
        await syncClient?.updateSyncSchedule(existingSchedule.schedule_id, frequency, offset);
    }
};
