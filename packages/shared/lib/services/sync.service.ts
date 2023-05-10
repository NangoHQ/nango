import { Client, Connection } from '@temporalio/client';
import db from '../database.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import { Sync, SyncStatus, SyncType } from '../models/Sync.js';
import type { LogLevel, LogAction } from '../models/Activity.js';
import { getConnectionById } from './connection.service.js';
import configService from './config.service.js';
import { create as createSyncScedule } from './sync-schedule.service.js';
import { createActivityLog, createActivityLogMessage } from './activity.service.js';

const table = '_nango_unified_syncs';
const TASK_QUEUE = 'unified_syncs';

export async function getClient(): Promise<Client | null> {
    try {
        const connection = await Connection.connect({
            address: process.env['TEMPORAL_ADDRESS'] || 'localhost:7233'
        });
        const client = new Client({
            connection
        });

        return client;
    } catch (e) {
        console.error(e);

        return null;
    }
}

const generateWorkflowId = (sync: Sync) => `unified-sync-${sync.id}`;
const generateScheduleId = (sync: Sync) => `unified-sync-schedule-${sync.id}`;

export const startContinuous = async (sync: Sync) => {
    const client = await getClient();
    const nangoConnection = await getConnectionById(sync.nango_connection_id);

    if (!client) {
        return;
    }

    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    const log = {
        level: 'info' as LogLevel,
        success: false,
        action: 'sync' as LogAction,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: nangoConnection?.connection_id as string,
        provider_config_key: nangoConnection?.provider_config_key as string,
        provider: syncConfig.provider as string,
        session_id: sync.id.toString(),
        account_id: nangoConnection?.account_id as number
    };
    const activityLogId = await createActivityLog(log);

    const handle = await client?.workflow.start('initialSync', {
        taskQueue: TASK_QUEUE,
        workflowId: generateWorkflowId(sync),
        args: [
            {
                syncId: sync.id,
                activityLogId
            }
        ]
    });

    // this will be dynamic
    const interval = '1h';
    const scheduleId = generateScheduleId(sync);

    // kick off schedule
    await client?.schedule.create({
        scheduleId,
        spec: {
            intervals: [{ every: interval }]
        },
        action: {
            type: 'startWorkflow',
            workflowType: 'continuousSync',
            taskQueue: TASK_QUEUE,
            args: [
                {
                    nangoConnectionId: nangoConnection?.id,
                    activityLogId
                }
            ]
        }
    });

    await createSyncScedule(nangoConnection?.id as number, scheduleId, interval);

    await createActivityLogMessage({
        level: 'info',
        activity_log_id: activityLogId as number,
        content: `Started initial background sync ${handle?.workflowId} and data updated on a schedule ${scheduleId} in the task queue: ${TASK_QUEUE}`,
        timestamp: Date.now()
    });
};

export const getById = async (id: number, argDb?: typeof db): Promise<Sync | null> => {
    const database = argDb || db;
    const result = await database.knex.withSchema(database.schema()).select('*').from<Sync>(table).where({ id: id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};

export const initiate = async (nangoConnectionId: number): Promise<void> => {
    const sync = await create(nangoConnectionId, SyncType.INITIAL);
    if (sync) {
        startContinuous(sync);
    }
};

export const create = async (nangoConnectionId: number, type: SyncType, argDb?: typeof db): Promise<Sync | null> => {
    const database = argDb || db;
    const result: void | Pick<Sync, 'id'> = await database.knex.withSchema(database.schema()).from<Sync>(table).insert(
        {
            nango_connection_id: nangoConnectionId,
            status: SyncStatus.RUNNING,
            type
        },
        ['id']
    );

    if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
        const statusId = result[0]['id'];
        return getById(statusId, database) as unknown as Sync;
    }

    return null;
};

export const updateStatus = async (id: number, status: SyncStatus, argDb?: typeof db): Promise<void> => {
    const database = argDb || db;
    return database.knex.withSchema(database.schema()).from<Sync>(table).where({ id }).update({
        status
    });
};

export const updateType = async (id: number, type: SyncType, argDb?: typeof db): Promise<void> => {
    const database = argDb || db;
    return database.knex.withSchema(database.schema()).from<Sync>(table).where({ id }).update({
        type
    });
};
