import { Client, Connection } from '@temporalio/client';
import db from '../db/database.js';
import { Sync, SyncStatus, SyncType } from '../models.js';
import { LogData, LogLevel, LogAction, updateAppLogsAndWrite } from '../utils/file-logger.js';

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

export const startContinuous = async (sync: Sync) => {
    const client = await getClient();

    if (!client) {
        return;
    }

    const handle = await client?.workflow.start('initialSync', {
        taskQueue: TASK_QUEUE,
        workflowId: `unified-sync-${sync.id}`,
        args: [
            {
                syncId: sync.id
            }
        ]
    });

    const log = {
        level: 'info' as LogLevel,
        success: false,
        action: 'unified' as LogAction,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connectionId: sync.connection_id as string,
        providerConfigKey: sync.provider_config_key as string,
        messages: [] as LogData['messages'],
        message: '',
        provider: '',
        sessionId: ''
    };

    // kick off schedule
    await client?.schedule.create({
        scheduleId: `unified-sync-schedule-${sync.id}`,
        spec: {
            //intervals: [{ every: '1h' }]
            intervals: [{ every: '10m' }]
        },
        action: {
            type: 'startWorkflow',
            workflowType: 'continuousSync',
            taskQueue: TASK_QUEUE,
            args: [
                {
                    providerConfigKey: sync.provider_config_key,
                    connectionId: sync.connection_id,
                    accountId: sync.account_id
                }
            ]
        }
    });

    updateAppLogsAndWrite(log, 'info', {
        content: `Started initial background sync ${handle?.workflowId} and data updated on a schedule in the task queue: ${TASK_QUEUE}`,
        timestamp: Date.now(),
        connectionId: sync.connection_id as string
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

export const initiate = async (connectionId: string, providerConfigKey: string, accountId: number): Promise<void> => {
    const sync = await create(connectionId, providerConfigKey, accountId, SyncType.INITIAL);
    if (sync) {
        startContinuous(sync);
    }
};

export const create = async (connectionId: string, providerConfigKey: string, accountId: number, type: SyncType, argDb?: typeof db): Promise<Sync | null> => {
    const database = argDb || db;
    const result: void | Pick<Sync, 'id'> = await database.knex.withSchema(database.schema()).from<Sync>(table).insert(
        {
            connection_id: connectionId,
            provider_config_key: providerConfigKey,
            account_id: accountId,
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
