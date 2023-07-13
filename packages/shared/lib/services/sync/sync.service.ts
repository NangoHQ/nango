import { v4 as uuidv4 } from 'uuid';
import db, { schema, dbNamespace } from '../../db/database.js';
import { IncomingSyncConfig, SyncDifferences, Sync, Job as SyncJob, SyncStatus, SyncWithSchedule, SlimSync } from '../../models/Sync.js';
import type { Connection, NangoConnection } from '../../models/Connection.js';
import SyncClient from '../../clients/sync.client.js';
import type { LogLevel, LogAction } from '../../models/Activity.js';
import { updateSuccess as updateSuccessActivityLog, createActivityLog, createActivityLogMessage, createActivityLogMessageAndEnd } from '../activity.service.js';
import { markAllAsStopped } from './schedule.service.js';
import { getActiveSyncConfigsByEnvironmentId, getSyncConfigsByProviderConfigKey } from './config.service.js';
import syncOrchestrator from './orchestrator.service.js';
import connectionService from '../connection.service.js';

const TABLE = dbNamespace + 'syncs';
const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';
const SYNC_SCHEDULE_TABLE = dbNamespace + 'sync_schedules';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';

/**
 * Sync Service
 * @description
 *  A Sync is active Nango Sync on the connection level that has:
 *  - collection of sync jobs (initial or incremental)
 *  - sync schedule
 *  - bunch of sync data records
 *
 *  A Sync config is a separate entity that is not necessarily active on the
 *  provider level that has no direction to a sync
 *  A Sync job can connect a sync and a sync config as it has both a `sync_id`
 * and `sync_config_id`
 *
 */

export const getById = async (id: string): Promise<Sync | null> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};

export const createSync = async (nangoConnectionId: number, name: string): Promise<Sync | null> => {
    const sync: Sync = {
        id: uuidv4(),
        nango_connection_id: nangoConnectionId,
        name
    };

    const result = await schema().from<Sync>(TABLE).insert(sync).returning('*');

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};

export const getLastSyncDate = async (nangoConnectionId: number, syncName: string): Promise<Date | null> => {
    const sync = await getSyncByIdAndName(nangoConnectionId, syncName);

    if (!sync) {
        return null;
    }

    const result = await schema()
        .select('updated_at')
        .from<SyncJob>(SYNC_JOB_TABLE)
        .where({
            sync_id: sync.id as string,
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

export const getSyncByIdAndName = async (nangoConnectionId: number, name: string): Promise<Sync | null> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId, name });

    if (Array.isArray(result) && result.length > 0) {
        return result[0] as Sync;
    }

    return null;
};

export const getSyncsFlat = async (nangoConnection: Connection): Promise<SyncWithSchedule[]> => {
    const result = await schema()
        .select('*')
        .from<Sync>(TABLE)
        .join(SYNC_SCHEDULE_TABLE, `${SYNC_SCHEDULE_TABLE}.sync_id`, `${TABLE}.id`)
        .where({ nango_connection_id: nangoConnection.id });

    if (Array.isArray(result) && result.length > 0) {
        return result;
    }

    return [];
};

/**
 * Get Syncs
 * @description get the sync related to the connection
 * the latest sync and its result and the next sync based on the schedule
 */
export const getSyncs = async (nangoConnection: Connection): Promise<Sync[]> => {
    const syncClient = await SyncClient.getInstance();

    if (!syncClient || !nangoConnection || !nangoConnection.id) {
        return [];
    }

    const scheduleResponse = await syncClient?.listSchedules();
    if (scheduleResponse?.schedules.length === 0) {
        await markAllAsStopped();
    }

    const result = await schema()
        .from<Sync>(TABLE)
        .select(
            `${TABLE}.*`,
            `${SYNC_SCHEDULE_TABLE}.schedule_id`,
            `${SYNC_SCHEDULE_TABLE}.frequency`,
            `${SYNC_SCHEDULE_TABLE}.offset`,
            `${SYNC_SCHEDULE_TABLE}.status as schedule_status`,
            db.knex.raw(
                `(
                    SELECT json_build_object(
                        'job_id', nango.${SYNC_JOB_TABLE}.id,
                        'updated_at', nango.${SYNC_JOB_TABLE}.updated_at,
                        'type', nango.${SYNC_JOB_TABLE}.type,
                        'result', nango.${SYNC_JOB_TABLE}.result,
                        'status', nango.${SYNC_JOB_TABLE}.status,
                        'activity_log_id', nango.${SYNC_JOB_TABLE}.activity_log_id,
                        'sync_config_id', nango.${SYNC_JOB_TABLE}.sync_config_id,
                        'version', nango.${SYNC_CONFIG_TABLE}.version,
                        'models', nango.${SYNC_CONFIG_TABLE}.models
                    )
                    FROM nango.${SYNC_JOB_TABLE}
                    JOIN nango.${SYNC_CONFIG_TABLE} ON nango.${SYNC_CONFIG_TABLE}.id = nango.${SYNC_JOB_TABLE}.sync_config_id
                    WHERE nango.${SYNC_JOB_TABLE}.sync_id = nango.${TABLE}.id
                    ORDER BY nango.${SYNC_JOB_TABLE}.updated_at DESC
                    LIMIT 1
                ) as latest_sync
                `
            )
        )
        .leftJoin(SYNC_JOB_TABLE, `${SYNC_JOB_TABLE}.sync_id`, '=', `${TABLE}.id`)
        .join(SYNC_SCHEDULE_TABLE, `${SYNC_SCHEDULE_TABLE}.sync_id`, `${TABLE}.id`)
        .where({
            nango_connection_id: nangoConnection.id
        })
        .groupBy(
            `${TABLE}.id`,
            `${SYNC_SCHEDULE_TABLE}.frequency`,
            `${SYNC_SCHEDULE_TABLE}.offset`,
            `${SYNC_SCHEDULE_TABLE}.status`,
            `${SYNC_SCHEDULE_TABLE}.schedule_id`
        );

    const syncsWithSchedule = result.map((sync) => {
        const { schedule_id } = sync;
        const schedule = scheduleResponse?.schedules.find((schedule) => schedule.scheduleId === schedule_id);
        const futureActionTimes = schedule?.info?.futureActionTimes?.map((long) => long?.seconds?.toNumber()) || [];

        return {
            ...sync,
            futureActionTimes
        };
    });

    if (Array.isArray(syncsWithSchedule) && syncsWithSchedule.length > 0) {
        return syncsWithSchedule;
    }

    return [];
};

export const getSyncsByConnectionId = async (nangoConnectionId: number): Promise<Sync[] | null> => {
    const results = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId });

    if (Array.isArray(results) && results.length > 0) {
        return results;
    }

    return null;
};

export const getSyncsByProviderConfigKey = async (environment_id: number, providerConfigKey: string): Promise<Sync[]> => {
    const results = await db.knex
        .withSchema(db.schema())
        .select(`${TABLE}.*`)
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            environment_id,
            provider_config_key: providerConfigKey
        });

    return results;
};

export const getSyncsByProviderConfigAndSyncName = async (environment_id: number, providerConfigKey: string, syncName: string): Promise<Sync[]> => {
    const results = await db.knex
        .withSchema(db.schema())
        .select(`${TABLE}.*`)
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            environment_id,
            provider_config_key: providerConfigKey,
            name: syncName
        });

    return results;
};

/**
 * Verify Ownership
 * @desc verify that the incoming account id matches with the provided nango connection id
 */
export const verifyOwnership = async (nangoConnectionId: number, environment_id: number, syncId: string): Promise<boolean> => {
    const result = await schema()
        .select('*')
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            environment_id,
            [`${TABLE}.id`]: syncId,
            nango_connection_id: nangoConnectionId
        });

    if (result.length === 0) {
        return false;
    }

    return true;
};

export const deleteSync = async (syncId: string): Promise<string> => {
    await schema().from<Sync>(TABLE).where({ id: syncId }).del();

    return syncId;
};

export const findSyncByConnections = async (connectionIds: number[]): Promise<Sync[]> => {
    const results = await schema().select('*').from<Sync>(TABLE).whereIn('nango_connection_id', connectionIds);

    if (Array.isArray(results) && results.length > 0) {
        return results;
    }

    return [];
};

export const getAndReconcileSyncDifferences = async (
    environmentId: number,
    syncs: IncomingSyncConfig[],
    performAction: boolean,
    debug = false
): Promise<SyncDifferences> => {
    const providers = syncs.map((sync) => sync.providerConfigKey);
    const providerConfigKeys = [...new Set(providers)];

    const log = {
        level: 'info' as LogLevel,
        success: null,
        action: 'sync deploy' as LogAction,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: null,
        provider: null,
        provider_config_key: `${syncs.length} sync${syncs.length === 1 ? '' : 's'} from ${providerConfigKeys.length} integration${
            providerConfigKeys.length === 1 ? '' : 's'
        }`,
        environment_id: environmentId,
        operation_name: 'sync.deploy'
    };

    let activityLogId = null;

    if (debug && performAction) {
        activityLogId = await createActivityLog(log);
    }

    const newSyncs: SlimSync[] = [];
    const syncsToCreate = [];

    const existingSyncsByProviderConfig: { [key: string]: SlimSync[] } = {};
    const existingConnectionsByProviderConfig: { [key: string]: NangoConnection[] } = {};

    for (const sync of syncs) {
        const { syncName, providerConfigKey } = sync;
        if (!existingSyncsByProviderConfig[providerConfigKey]) {
            // this gets syncs that have a sync config and are active OR just have a sync config
            existingSyncsByProviderConfig[providerConfigKey] = await getSyncConfigsByProviderConfigKey(environmentId, providerConfigKey);
            existingConnectionsByProviderConfig[providerConfigKey] = await connectionService.getConnectionsByEnvironmentAndConfig(
                environmentId,
                providerConfigKey
            );
        }
        const currentSync = existingSyncsByProviderConfig[providerConfigKey];

        const exists = currentSync?.find((existingSync) => existingSync.name === syncName);
        const connections = existingConnectionsByProviderConfig[providerConfigKey] as Connection[];

        let isNew = false;

        // if it has connections but doesn't have an active sync then it is considered a new sync
        if (exists && connections.length > 0) {
            const syncsByConnection = await findSyncByConnections(connections.map((connection) => connection.id as number));
            isNew = syncsByConnection.length === 0;
        }

        if (!exists || isNew) {
            newSyncs.push({ name: syncName, providerConfigKey, connections: existingConnectionsByProviderConfig[providerConfigKey]?.length as number });
            if (performAction) {
                if (activityLogId) {
                    await createActivityLogMessage({
                        level: 'debug',
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: `Creating sync ${syncName} for ${providerConfigKey} with ${connections.length} connections and initiating`
                    });
                }
                syncsToCreate.push({ connections, syncName, sync, providerConfigKey, environmentId });
            }
        }
    }

    if (syncsToCreate.length > 0) {
        if (debug) {
            const syncNames = syncsToCreate.map((sync) => sync.syncName);
            await createActivityLogMessage({
                level: 'debug',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Creating ${syncsToCreate.length} sync${syncsToCreate.length === 1 ? '' : 's'} ${JSON.stringify(syncNames, null, 2)}`
            });
        }
        // this is taken out of the loop to ensure it awaits all the calls properly
        await syncOrchestrator.createSyncs(syncsToCreate, debug, activityLogId as number);
    }

    const existingSyncs = await getActiveSyncConfigsByEnvironmentId(environmentId);
    const deletedSyncs = [];

    for (const existingSync of existingSyncs) {
        const exists = syncs.find((sync) => sync.syncName === existingSync.sync_name && sync.providerConfigKey === existingSync.unique_key);

        if (!exists) {
            const connections = await connectionService.getConnectionsByEnvironmentAndConfig(environmentId, existingSync.unique_key);
            deletedSyncs.push({
                name: existingSync.sync_name,
                providerConfigKey: existingSync.unique_key,
                connections: connections?.length as number
            });

            if (performAction) {
                if (activityLogId) {
                    await createActivityLogMessage({
                        level: 'debug',
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: `Deleting sync ${existingSync.sync_name} for ${existingSync.unique_key} with ${connections.length} connections`
                    });
                }
                await syncOrchestrator.deleteConfig(existingSync.id as number);
                for (const connection of connections) {
                    const syncId = await getSyncByIdAndName(connection.id as number, existingSync.sync_name);
                    if (syncId) {
                        await syncOrchestrator.deleteSync(syncId.id as string);
                    }
                }
            }
        }
    }

    if (activityLogId) {
        await createActivityLogMessageAndEnd({
            level: 'debug',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: 'Sync deploy diff in debug mode process complete successfully.'
        });
        await updateSuccessActivityLog(activityLogId, true);
    }

    return {
        newSyncs,
        deletedSyncs
    };
};
