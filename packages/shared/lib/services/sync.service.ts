import { Client, Connection } from '@temporalio/client';
import type { Connection as NangoConnection } from '../models/Connection.js';
import db, { schema, dbNamespace } from '../db/database.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import { Sync, SyncStatus, SyncType, SyncConfig } from '../models/Sync.js';
import type { LogLevel, LogAction } from '../models/Activity.js';
import connectionService from './connection.service.js';
import configService from './config.service.js';
import { createSchedule as createSyncScedule } from './sync-schedule.service.js';
import { createActivityLog, createActivityLogMessage } from './activity.service.js';
import { TASK_QUEUE } from '../constants.js';
import type { NangoConfig, NangoIntegration, NangoIntegrationData } from '../integrations/index.js';
import { loadNangoConfig, getCronExpression } from './nango-config.service.js';

const TABLE = dbNamespace + 'sync_jobs';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';

// TODO break this up

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

const generateWorkflowId = (sync: Sync, syncName: string) => `${TASK_QUEUE}.${syncName}-${sync.id}`;
const generateScheduleId = (sync: Sync, syncName: string) => `${TASK_QUEUE}.${syncName}-schedule-${sync.id}`;

/**
 * Start Continuous
 * @desc get the connection information and the provider information
 * and kick off an initial sync and also a incremental sync. Also look
 * up any sync configs to call any integration snippet that was setup
 */
export const startContinuous = async (
    client: Client,
    nangoConnection: NangoConnection,
    sync: Sync,
    syncConfig: ProviderConfig,
    syncName: string,
    syncData: NangoIntegrationData
) => {
    const log = {
        level: 'info' as LogLevel,
        success: false,
        action: 'sync' as LogAction,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: nangoConnection?.connection_id as string,
        provider_config_key: nangoConnection?.provider_config_key as string,
        provider: syncConfig.provider,
        session_id: sync.id.toString(),
        account_id: nangoConnection?.account_id as number
    };
    const activityLogId = await createActivityLog(log);

    const handle = await client?.workflow.start('initialSync', {
        taskQueue: TASK_QUEUE,
        workflowId: generateWorkflowId(sync, syncName),
        args: [
            {
                syncId: sync.id,
                activityLogId
            }
        ]
    });

    const frequency = getCronExpression(syncData.runs);
    const scheduleId = generateScheduleId(sync, syncName);

    // kick off schedule
    await client?.schedule.create({
        scheduleId,
        spec: {
            cronExpressions: [frequency]
        },
        action: {
            type: 'startWorkflow',
            workflowType: 'continuousSync',
            taskQueue: TASK_QUEUE,
            args: [
                {
                    nangoConnectionId: nangoConnection?.id,
                    activityLogId,
                    syncName
                }
            ]
        }
    });

    await createSyncScedule(nangoConnection?.id as number, scheduleId, frequency);

    await createActivityLogMessage({
        level: 'info',
        activity_log_id: activityLogId as number,
        content: `Started initial background sync ${handle?.workflowId} and data updated on a schedule ${scheduleId} at ${syncData.runs} in the task queue: ${TASK_QUEUE}`,
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
    const nangoConnection = (await connectionService.getConnectionById(nangoConnectionId)) as NangoConnection;
    const nangoConfig = loadNangoConfig();
    if (!nangoConfig) {
        console.log('Failed to load Nango config - will not start any syncs!');
        return;
    }
    const { integrations }: NangoConfig = nangoConfig;
    const providerConfigKey = nangoConnection?.provider_config_key as string;

    if (!integrations[providerConfigKey]) {
        console.log(`No syncs registered for provider ${providerConfigKey} - will not start any syncs!`);
        return;
    }

    const client = await getClient();

    if (!client) {
        console.log('Failed to get a Temporal client - will not start any syncs!');
        return;
    }

    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
    const syncNames = Object.keys(syncObject);
    for (let k = 0; k < syncNames.length; k++) {
        const syncName = syncNames[k] as string;
        const syncData = syncObject[syncName] as unknown as NangoIntegrationData;

        const sync = await createSyncJob(nangoConnectionId, SyncType.INITIAL, syncName);

        if (sync) {
            startContinuous(client as Client, nangoConnection, sync, syncConfig, syncName, syncData);
        }
    }
};

export const createSyncJob = async (nangoConnectionId: number, type: SyncType, syncName: string): Promise<Sync | null> => {
    const result: void | Pick<Sync, 'id'> = await db.knex.withSchema(db.schema()).from<Sync>(TABLE).insert(
        {
            nango_connection_id: nangoConnectionId,
            sync_name: syncName,
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

export const getLastSyncDate = async (nangoConnectionId: number, syncName: string): Promise<Date | null> => {
    const result = await schema()
        .select('updated_at')
        .from<Sync>(TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            sync_name: syncName,
            status: SyncStatus.SUCCESS
        })
        .orderBy('updated_at', 'desc')
        .first();

    if (!result) {
        return null;
    }

    const { updated_at } = result;

    return updated_at;
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

export const deleteSyncSchedule = async (id: string): Promise<boolean> => {
    const client = await getClient();

    if (!client) {
        return false;
    }

    const workflowService = client?.workflowService;
    try {
        await workflowService?.deleteSchedule({
            scheduleId: id,
            namespace: process.env['TEMPORAL_NAMESPACE'] || 'default'
        });
        return true;
    } catch (e) {
        return false;
    }
};
