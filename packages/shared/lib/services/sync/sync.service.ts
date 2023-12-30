import { v4 as uuidv4 } from 'uuid';
import db, { schema, dbNamespace } from '../../db/database.js';
import {
    SyncConfigType,
    IncomingFlowConfig,
    SyncAndActionDifferences,
    Sync,
    Job as SyncJob,
    SyncStatus,
    SyncWithSchedule,
    SlimSync,
    SlimAction
} from '../../models/Sync.js';
import type { Connection, NangoConnection } from '../../models/Connection.js';
import SyncClient from '../../clients/sync.client.js';
import { updateSuccess as updateSuccessActivityLog, createActivityLogMessage, createActivityLogMessageAndEnd } from '../activity/activity.service.js';
import { markAllAsStopped } from './schedule.service.js';
import {
    getActiveCustomSyncConfigsByEnvironmentId,
    getSyncConfigsByProviderConfigKey,
    getActionConfigByNameAndProviderConfigKey
} from './config/config.service.js';
import syncOrchestrator from './orchestrator.service.js';
import connectionService from '../connection.service.js';

const TABLE = dbNamespace + 'syncs';
const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';
const SYNC_SCHEDULE_TABLE = dbNamespace + 'sync_schedules';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';
const ACTIVITY_LOG_TABLE = dbNamespace + 'activity_logs';

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
    const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ id, deleted: false });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};

export const createSync = async (nangoConnectionId: number, name: string): Promise<Sync | null> => {
    const existingSync = await getSyncByIdAndName(nangoConnectionId, name);

    if (existingSync) {
        return null;
    }

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

export const getLastSyncDate = async (id: string, backup = true): Promise<Date | null> => {
    const result = await schema().select('last_sync_date').from<Sync>(TABLE).where({
        id,
        deleted: false
    });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    let { last_sync_date } = result[0];

    if (backup && last_sync_date === null) {
        last_sync_date = await getJobLastSyncDate(id);
    }

    return last_sync_date;
};

export const clearLastSyncDate = async (id: string): Promise<void> => {
    await schema()
        .from<Sync>(TABLE)
        .where({
            id,
            deleted: false
        })
        .update({
            last_sync_date: null
        });
};

/**
 * Set Last Sync Date
 * @desc if passed a valid date set the sync date, however if
 * we don't want to override the sync make sure it is null
 * before we set it
 *
 * This is due to the fact that users can set the last sync date
 * during the integration script so we don't want to override what they
 * set in the script
 */
export const setLastSyncDate = async (id: string, tempDate: Date | string, override = true): Promise<boolean> => {
    if (!tempDate) {
        return false;
    }

    const date = typeof tempDate === 'string' ? new Date(tempDate) : tempDate;

    if (isNaN(date.getTime())) {
        return false;
    }

    // if override is false that means we need to verify
    // that we should update the last sync date
    // if it isn't null
    if (!override) {
        const lastSyncDate = await getLastSyncDate(id, false);

        if (lastSyncDate !== null) {
            return false;
        }
    }

    await schema()
        .from<Sync>(TABLE)
        .where({
            id,
            deleted: false
        })
        .update({
            last_sync_date: date
        });

    return true;
};

/**
 * Get Last Sync Date
 * @desc this is the very end of the sync process so we know when the sync job
 * is completely finished
 */
export const getJobLastSyncDate = async (sync_id: string): Promise<Date | null> => {
    const result = await schema()
        .select('updated_at')
        .from<SyncJob>(SYNC_JOB_TABLE)
        .where({
            sync_id,
            status: SyncStatus.SUCCESS,
            deleted: false
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
    const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({
        nango_connection_id: nangoConnectionId,
        name,
        deleted: false
    });

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
        .where({
            nango_connection_id: nangoConnection.id,
            [`${SYNC_SCHEDULE_TABLE}.deleted`]: false,
            [`${TABLE}.deleted`]: false
        });

    if (Array.isArray(result) && result.length > 0) {
        return result;
    }

    return [];
};

export const getSyncsFlatWithNames = async (nangoConnection: Connection, syncNames: string[]): Promise<SyncWithSchedule[]> => {
    const result = await schema()
        .select('*')
        .from<Sync>(TABLE)
        .join(SYNC_SCHEDULE_TABLE, `${SYNC_SCHEDULE_TABLE}.sync_id`, `${TABLE}.id`)
        .where({
            nango_connection_id: nangoConnection.id,
            [`${SYNC_SCHEDULE_TABLE}.deleted`]: false,
            [`${TABLE}.deleted`]: false
        })
        .whereIn(`${TABLE}.name`, syncNames);

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

    const syncJobTimestampsSubQuery = db.knex.raw(
        `(
            SELECT json_agg(json_build_object(
                'created_at', nango.${SYNC_JOB_TABLE}.created_at,
                'updated_at', nango.${SYNC_JOB_TABLE}.updated_at
            ))
            FROM nango.${SYNC_JOB_TABLE}
            WHERE nango.${SYNC_JOB_TABLE}.sync_id = nango.${TABLE}.id
                AND nango.${SYNC_JOB_TABLE}.created_at >= CURRENT_DATE - INTERVAL '30 days'
                AND nango.${SYNC_JOB_TABLE}.deleted = false
        ) as thirty_day_timestamps`
    );

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
                        'created_at', nango.${SYNC_JOB_TABLE}.created_at,
                        'updated_at', nango.${SYNC_JOB_TABLE}.updated_at,
                        'type', nango.${SYNC_JOB_TABLE}.type,
                        'result', nango.${SYNC_JOB_TABLE}.result,
                        'status', nango.${SYNC_JOB_TABLE}.status,
                        'sync_config_id', nango.${SYNC_JOB_TABLE}.sync_config_id,
                        'version', nango.${SYNC_CONFIG_TABLE}.version,
                        'models', nango.${SYNC_CONFIG_TABLE}.models,
                        'activity_log_id', nango.${ACTIVITY_LOG_TABLE}.id
                    )
                    FROM nango.${SYNC_JOB_TABLE}
                    JOIN nango.${SYNC_CONFIG_TABLE} ON nango.${SYNC_CONFIG_TABLE}.id = nango.${SYNC_JOB_TABLE}.sync_config_id
                    LEFT JOIN nango.${ACTIVITY_LOG_TABLE} ON nango.${ACTIVITY_LOG_TABLE}.session_id = nango.${SYNC_JOB_TABLE}.id::text
                    WHERE nango.${SYNC_JOB_TABLE}.sync_id = nango.${TABLE}.id
                    AND nango.${SYNC_JOB_TABLE}.deleted = false
                    AND nango.${SYNC_CONFIG_TABLE}.deleted = false
                    ORDER BY nango.${SYNC_JOB_TABLE}.updated_at DESC
                    LIMIT 1
                ) as latest_sync
                `
            ),
            syncJobTimestampsSubQuery
        )
        .leftJoin(SYNC_JOB_TABLE, `${SYNC_JOB_TABLE}.sync_id`, '=', `${TABLE}.id`)
        .join(SYNC_SCHEDULE_TABLE, `${SYNC_SCHEDULE_TABLE}.sync_id`, `${TABLE}.id`)
        .where({
            nango_connection_id: nangoConnection.id,
            [`${SYNC_SCHEDULE_TABLE}.deleted`]: false,
            [`${SYNC_JOB_TABLE}.deleted`]: false,
            [`${TABLE}.deleted`]: false
        })
        .orderBy(`${TABLE}.name`, 'asc')
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
    const results = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId, deleted: false });

    if (Array.isArray(results) && results.length > 0) {
        return results;
    }

    return null;
};

export const getSyncsByProviderConfigKey = async (environment_id: number, providerConfigKey: string): Promise<Sync[]> => {
    const results = await db.knex
        .withSchema(db.schema())
        .select(`${TABLE}.id`, `${TABLE}.name`, `_nango_connections.connection_id`, `${TABLE}.created_at`, `${TABLE}.updated_at`, `${TABLE}.last_sync_date`)
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            environment_id,
            provider_config_key: providerConfigKey,
            [`_nango_connections.deleted`]: false,
            [`${TABLE}.deleted`]: false
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
            name: syncName,
            [`_nango_connections.deleted`]: false,
            [`${TABLE}.deleted`]: false
        });

    return results;
};

export const getSyncNamesByConnectionId = async (nangoConnectionId: number): Promise<string[]> => {
    const results = await db.knex.withSchema(db.schema()).select('name').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId, deleted: false });

    if (Array.isArray(results) && results.length > 0) {
        return results.map((sync) => sync.name);
    }

    return [];
};

export const getSyncsByProviderConfigAndSyncNames = async (environment_id: number, providerConfigKey: string, syncNames: string[]): Promise<Sync[]> => {
    const results = await db.knex
        .withSchema(db.schema())
        .select(`${TABLE}.*`)
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            environment_id,
            provider_config_key: providerConfigKey,
            [`_nango_connections.deleted`]: false,
            [`${TABLE}.deleted`]: false
        })
        .whereIn('name', syncNames);

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
            nango_connection_id: nangoConnectionId,
            [`_nango_connections.deleted`]: false,
            [`${TABLE}.deleted`]: false
        });

    if (result.length === 0) {
        return false;
    }

    return true;
};

export const deleteSync = async (syncId: string): Promise<string> => {
    await schema().from<Sync>(TABLE).where({ id: syncId, deleted: false }).update({ deleted: true, deleted_at: new Date() });

    await syncOrchestrator.deleteSyncRelatedObjects(syncId);

    return syncId;
};

export const findSyncByConnections = async (connectionIds: number[], sync_name: string): Promise<Sync[]> => {
    const results = await schema()
        .select('*')
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .whereIn('nango_connection_id', connectionIds)
        .andWhere({
            name: sync_name,
            [`${TABLE}.deleted`]: false,
            [`_nango_connections.deleted`]: false
        });

    if (Array.isArray(results) && results.length > 0) {
        return results;
    }

    return [];
};

export const getSyncsByConnectionIdsAndEnvironmentIdAndSyncName = async (connectionIds: string[], environmentId: number, syncName: string): Promise<Sync[]> => {
    const results = await schema()
        .select(`${TABLE}.id`)
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .whereIn('_nango_connections.connection_id', connectionIds)
        .andWhere({
            name: syncName,
            environment_id: environmentId,
            [`${TABLE}.deleted`]: false,
            [`_nango_connections.deleted`]: false
        });

    if (Array.isArray(results) && results.length > 0) {
        return results;
    }

    return [];
};

export const getAndReconcileDifferences = async (
    environmentId: number,
    syncs: IncomingFlowConfig[],
    performAction: boolean,
    activityLogId: number | null,
    debug = false,
    singleDeployMode = false
): Promise<SyncAndActionDifferences | null> => {
    const newSyncs: SlimSync[] = [];
    const newActions: SlimAction[] = [];
    const syncsToCreate = [];

    const existingSyncsByProviderConfig: { [key: string]: SlimSync[] } = {};
    const existingConnectionsByProviderConfig: { [key: string]: NangoConnection[] } = {};

    for (const sync of syncs) {
        const { syncName, providerConfigKey, type } = sync;
        if (type === SyncConfigType.ACTION) {
            const actionExists = await getActionConfigByNameAndProviderConfigKey(environmentId, syncName, providerConfigKey);
            if (!actionExists) {
                newActions.push({
                    name: syncName,
                    providerConfigKey
                });
            }
            continue;
        }

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

        /*
         * The possible scenarios are as follows:
         * 1. There are connections for the provider but doesn't have an active sync -- it is a new sync, isNew = true
         * 2. It doesn't exist yet, so exists = false, which means we're in the reconciliation step so performAction = false so we don't create the sync
         * When we come back here and performAction is true, the sync would have been created so exists will be true and we'll only create
         * the sync if there are connections
         */
        let syncsByConnection: Sync[] = [];
        if (exists && connections.length > 0) {
            syncsByConnection = await findSyncByConnections(
                connections.map((connection) => connection.id as number),
                syncName
            );
            isNew = syncsByConnection.length === 0;
        }

        if (!exists || isNew) {
            newSyncs.push({
                name: syncName,
                providerConfigKey,
                connections: existingConnectionsByProviderConfig[providerConfigKey]?.length as number,
                auto_start: sync.auto_start === false ? false : true
            });
            if (performAction) {
                if (debug && activityLogId) {
                    await createActivityLogMessage({
                        level: 'debug',
                        environment_id: environmentId,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: `Creating sync ${syncName} for ${providerConfigKey} with ${connections.length} connections and initiating`
                    });
                }
                syncsToCreate.push({ connections, syncName, sync, providerConfigKey, environmentId });
            }
        }

        // in some cases syncs are missing so let's also create them if missing
        if (performAction && syncsByConnection.length !== 0 && syncsByConnection.length !== connections.length) {
            const missingConnections = connections.filter((connection) => {
                return !syncsByConnection.find((sync) => sync.nango_connection_id === connection.id);
            });

            if (missingConnections.length > 0) {
                if (debug && activityLogId) {
                    await createActivityLogMessage({
                        level: 'debug',
                        environment_id: environmentId,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: `Creating sync ${syncName} for ${providerConfigKey} with ${missingConnections.length} connections`
                    });
                }
                syncsToCreate.push({ connections: missingConnections, syncName, sync, providerConfigKey, environmentId });
            }
        }
    }

    if (syncsToCreate.length > 0) {
        if (debug && activityLogId) {
            const syncNames = syncsToCreate.map((sync) => sync.syncName);
            await createActivityLogMessage({
                level: 'debug',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Creating ${syncsToCreate.length} sync${syncsToCreate.length === 1 ? '' : 's'} ${JSON.stringify(syncNames, null, 2)}`
            });
        }
        // this is taken out of the loop to ensure it awaits all the calls properly
        const result = await syncOrchestrator.createSyncs(syncsToCreate, debug, activityLogId as number);

        if (!result) {
            if (activityLogId) {
                await updateSuccessActivityLog(activityLogId as number, false);
            }
            return null;
        }
    }

    // we don't want to include pre built syncs as they are handled differently hence
    // the "custom" sync configs
    const existingSyncs = await getActiveCustomSyncConfigsByEnvironmentId(environmentId);

    const deletedSyncs: SlimSync[] = [];
    const deletedActions: SlimAction[] = [];

    if (!singleDeployMode) {
        for (const existingSync of existingSyncs) {
            const exists = syncs.find((sync) => sync.syncName === existingSync.sync_name && sync.providerConfigKey === existingSync.unique_key);

            if (!exists) {
                const connections = await connectionService.getConnectionsByEnvironmentAndConfig(environmentId, existingSync.unique_key);
                if (existingSync.type === SyncConfigType.SYNC) {
                    deletedSyncs.push({
                        name: existingSync.sync_name,
                        providerConfigKey: existingSync.unique_key,
                        connections: connections?.length as number
                    });
                } else {
                    deletedActions.push({
                        name: existingSync.sync_name,
                        providerConfigKey: existingSync.unique_key
                    });
                }

                if (performAction) {
                    if (debug && activityLogId) {
                        await createActivityLogMessage({
                            level: 'debug',
                            environment_id: environmentId,
                            activity_log_id: activityLogId as number,
                            timestamp: Date.now(),
                            content: `Deleting sync ${existingSync.sync_name} for ${existingSync.unique_key} with ${connections.length} connections`
                        });
                    }
                    await syncOrchestrator.deleteConfig(existingSync.id as number, environmentId);

                    if (existingSync.type === SyncConfigType.SYNC) {
                        for (const connection of connections) {
                            const syncId = await getSyncByIdAndName(connection.id as number, existingSync.sync_name);
                            if (syncId) {
                                await syncOrchestrator.deleteSync(syncId.id as string, environmentId);
                            }
                        }
                    }

                    if (activityLogId) {
                        const connectionDescription =
                            existingSync.type === SyncConfigType.SYNC ? ` with ${connections.length} connection${connections.length > 1 ? 's' : ''}.` : '.';
                        const content = `Successfully deleted ${existingSync.type} ${existingSync.sync_name} for ${existingSync.unique_key}${connectionDescription}`;

                        await createActivityLogMessage({
                            level: 'debug',
                            environment_id: environmentId,
                            activity_log_id: activityLogId as number,
                            timestamp: Date.now(),
                            content
                        });
                    }
                }
            }
        }
    }

    if (debug && activityLogId) {
        await createActivityLogMessageAndEnd({
            level: 'debug',
            environment_id: environmentId,
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content: 'Sync deploy diff in debug mode process complete successfully.'
        });
    }

    return {
        newSyncs,
        newActions,
        deletedSyncs,
        deletedActions
    };
};
