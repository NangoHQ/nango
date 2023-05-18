import { Client, Connection } from '@temporalio/client';
import db, { dbNamespace } from '../db/database.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import { Sync, SyncStatus, SyncType, SyncConfig } from '../models/Sync.js';
import type { LogLevel, LogAction } from '../models/Activity.js';
import { getConnectionById } from './connection.service.js';
import configService from './config.service.js';
import { create as createSyncScedule } from './sync-schedule.service.js';
import { createActivityLog, createActivityLogMessage } from './activity.service.js';
import { TASK_QUEUE } from '../constants.js';

const TABLE = dbNamespace + 'sync_jobs';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';

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

const generateWorkflowId = (sync: Sync) => `${TASK_QUEUE}-${sync.id}`;
const generateScheduleId = (sync: Sync) => `${TASK_QUEUE}-schedule-${sync.id}`;

/**
 * Start Continuous
 * @desc get the connection information and the provider information
 * and kick off an initial sync and also a incremental sync. Also look
 * up any sync configs to call any integration snippet that was setup
 */
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

    const provider = syncConfig.provider as string;

    //const [firstConfig] = (await getSyncConfigByProvider(provider)) as SyncConfig[];
    //const { integration_name: integrationName } = firstConfig as SyncConfig;
    //const integrationPath = `../nango-integrations/${integrationName}.js` + `?v=${Math.random().toString(36).substring(3)}`;
    //const { default: integrationCode } = await import(integrationPath);
    //const integrationClass = new integrationCode();

    //const userDefinedResults = await integrationClass.fetchData(nango);
    //console.log(userDefinedResults);

    const log = {
        level: 'info' as LogLevel,
        success: false,
        action: 'sync' as LogAction,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: nangoConnection?.connection_id as string,
        provider_config_key: nangoConnection?.provider_config_key as string,
        provider,
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

export const getById = async (id: number): Promise<Sync | null> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ id: id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};

export const initiate = async (nangoConnectionId: number): Promise<void> => {
    // based on the service we'll initiate different types of syncs
    // For github we'll do a sync of issues, comments
    const sync = await create(nangoConnectionId, SyncType.INITIAL);
    if (sync) {
        startContinuous(sync);
    }
};

export const create = async (nangoConnectionId: number, type: SyncType): Promise<Sync | null> => {
    const result: void | Pick<Sync, 'id'> = await db.knex.withSchema(db.schema()).from<Sync>(TABLE).insert(
        {
            nango_connection_id: nangoConnectionId,
            status: SyncStatus.RUNNING,
            type
        },
        ['id']
    );

    if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
        const statusId = result[0]['id'];
        return getById(statusId) as unknown as Sync;
    }

    return null;
};

export const updateStatus = async (id: number, status: SyncStatus): Promise<void> => {
    return db.knex.withSchema(db.schema()).from<Sync>(TABLE).where({ id }).update({
        status
    });
};

export const updateType = async (id: number, type: SyncType): Promise<void> => {
    return db.knex.withSchema(db.schema()).from<Sync>(TABLE).where({ id }).update({
        type
    });
};

export const createSyncConfig = async (account_id: number, provider: string, integrationName: string, snippet: string): Promise<boolean> => {
    const result: void | Pick<SyncConfig, 'id'> = await db.knex.withSchema(db.schema()).from<SyncConfig>(SYNC_CONFIG_TABLE).insert(
        {
            account_id,
            provider,
            integration_name: integrationName,
            snippet
        },
        ['id']
    );

    if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
        return true;
    }
    return false;
};

export const getSyncConfigByProvider = async (provider: string): Promise<SyncConfig[]> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from<SyncConfig>(SYNC_CONFIG_TABLE).where({ provider: provider });

    if (Array.isArray(result) && result.length > 0) {
        return result;
    }

    return [];
};
