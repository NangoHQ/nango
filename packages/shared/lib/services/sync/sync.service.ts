import { v4 as uuidv4 } from 'uuid';
import db, { schema, dbNamespace } from '@nangohq/database';
import type { Sync, SyncWithConnectionId, SyncConfig, Job as SyncJob } from '../../models/Sync.js';
import { SyncStatus } from '../../models/Sync.js';
import type { Connection, NangoConnection } from '../../models/Connection.js';
import type { ActiveLog, IncomingFlowConfig, SlimAction, SlimSync, SyncAndActionDifferences, SyncTypeLiteral } from '@nangohq/types';
import {
    getActiveCustomSyncConfigsByEnvironmentId,
    getSyncConfigsByProviderConfigKey,
    getActionConfigByNameAndProviderConfigKey
} from './config/config.service.js';
import type { CreateSyncArgs } from './manager.service.js';
import syncManager from './manager.service.js';
import connectionService from '../connection.service.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type { Orchestrator } from '../../clients/orchestrator.js';
import { stringifyError } from '@nangohq/utils';

const TABLE = dbNamespace + 'syncs';
const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';
const ACTIVE_LOG_TABLE = dbNamespace + 'active_logs';

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
    const result = await db.knex.select('*').from<Sync>(TABLE).where({ id, deleted: false });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};

export const createSync = async (nangoConnectionId: number, syncConfig: SyncConfig): Promise<Sync | null> => {
    const existingSync = await getSyncByIdAndName(nangoConnectionId, syncConfig.sync_name);

    if (existingSync || !syncConfig.id) {
        return null;
    }

    const sync: Omit<Sync, 'created_at' | 'updated_at'> = {
        id: uuidv4(),
        nango_connection_id: nangoConnectionId,
        name: syncConfig.sync_name,
        frequency: null,
        last_sync_date: null,
        last_fetched_at: null,
        sync_config_id: syncConfig.id
    };

    const result = await schema().from<Sync>(TABLE).insert(sync).returning('*');

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};

export const getLastSyncDate = async (id: string): Promise<Date | null> => {
    const result = await schema().select<{ last_sync_date: Date | null }[]>('last_sync_date').from<Sync>(TABLE).where({
        id,
        deleted: false
    });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0].last_sync_date;
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

export async function setFrequency(id: string, frequency: string | null): Promise<void> {
    await schema().from<Sync>(TABLE).where({ id }).update({
        frequency
    });
}

/**
 * Set Last Sync Date
 */
export const setLastSyncDate = async (id: string, date: Date): Promise<boolean> => {
    await schema().from<Sync>(TABLE).where({ id, deleted: false }).update({ last_sync_date: date });

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
    const result = await db.knex.select('*').from<Sync>(TABLE).where({
        nango_connection_id: nangoConnectionId,
        name,
        deleted: false
    });

    if (Array.isArray(result) && result.length > 0) {
        return result[0] as Sync;
    }

    return null;
};

/**
 * Get Syncs
 * @description get the sync related to the connection
 * the latest sync and its result and the next sync based on the schedule
 */
export const getSyncs = async (
    nangoConnection: Connection,
    orchestrator: Orchestrator
): Promise<(Sync & { sync_type: SyncTypeLiteral; status: SyncStatus; active_logs: Pick<ActiveLog, 'log_id'>; models: string[] })[]> => {
    const q = db.knex
        .from<Sync>(TABLE)
        .select(
            `${TABLE}.*`,
            `${TABLE}.frequency as frequency_override`,
            `${SYNC_CONFIG_TABLE}.sync_type`,
            `${SYNC_CONFIG_TABLE}.runs as frequency`,
            `${SYNC_CONFIG_TABLE}.models`,
            `${ACTIVE_LOG_TABLE}.log_id as error_log_id`,
            db.knex.raw(`json_build_object( 'log_id', ${ACTIVE_LOG_TABLE}.log_id) as active_logs`),
            db.knex.raw(
                `(SELECT json_build_object(
                            'job_id', ${SYNC_JOB_TABLE}.id,
                            'created_at', ${SYNC_JOB_TABLE}.created_at,
                            'updated_at', ${SYNC_JOB_TABLE}.updated_at,
                            'type', ${SYNC_JOB_TABLE}.type,
                            'result', ${SYNC_JOB_TABLE}.result,
                            'status', ${SYNC_JOB_TABLE}.status,
                            'sync_config_id', ${SYNC_JOB_TABLE}.sync_config_id,
                            'version', ${SYNC_CONFIG_TABLE}.version,
                            'models', ${SYNC_CONFIG_TABLE}.models
                        )
                        FROM ${SYNC_JOB_TABLE}
                        JOIN ${SYNC_CONFIG_TABLE} ON ${SYNC_CONFIG_TABLE}.id = ${SYNC_JOB_TABLE}.sync_config_id AND ${SYNC_CONFIG_TABLE}.deleted = false
                        WHERE ${SYNC_JOB_TABLE}.sync_id = ${TABLE}.id AND ${SYNC_JOB_TABLE}.deleted = false
                        ORDER BY ${SYNC_JOB_TABLE}.created_at DESC
                        LIMIT 1) as latest_sync`
            )
        )
        .leftJoin(ACTIVE_LOG_TABLE, function () {
            this.on(`${ACTIVE_LOG_TABLE}.sync_id`, `${TABLE}.id`).andOnVal(`${ACTIVE_LOG_TABLE}.active`, true).andOnVal(`${ACTIVE_LOG_TABLE}.type`, 'sync');
        })
        .join(SYNC_CONFIG_TABLE, function () {
            this.on(`${SYNC_CONFIG_TABLE}.sync_name`, `${TABLE}.name`)
                .andOn(`${SYNC_CONFIG_TABLE}.deleted`, '=', db.knex.raw('FALSE'))
                .andOn(`${SYNC_CONFIG_TABLE}.active`, '=', db.knex.raw('TRUE'))
                .andOn(`${SYNC_CONFIG_TABLE}.type`, '=', db.knex.raw('?', 'sync'))
                .andOn(`${SYNC_CONFIG_TABLE}.enabled`, '=', db.knex.raw('?', 'TRUE'));
        })
        .where({
            nango_connection_id: nangoConnection.id,
            [`${SYNC_CONFIG_TABLE}.nango_config_id`]: nangoConnection.config_id,
            [`${TABLE}.deleted`]: false
        })
        .orderBy(`${TABLE}.name`, 'asc');

    const result = await q;

    const searchSchedulesProps = result.map((sync) => {
        return { syncId: sync.id, environmentId: nangoConnection.environment_id };
    });
    const schedules = await orchestrator.searchSchedules(searchSchedulesProps);
    if (schedules.isErr()) {
        throw new Error(`Failed to get schedules for environment ${nangoConnection.environment_id}: ${stringifyError(schedules.error)}`);
    }
    return result.map((sync) => {
        const schedule = schedules.value.get(sync.id);
        const { job_row_number, ...syncData } = sync;
        if (schedule) {
            return {
                ...syncData,
                frequency: sync.frequency_override || sync.frequency,
                schedule_status: schedule.state,
                status: syncManager.classifySyncStatus(sync?.latest_sync?.status, schedule.state),
                futureActionTimes: schedule.nextDueDate ? [schedule.nextDueDate.getTime() / 1000] : []
            };
        }
        return sync;
    });
};

export const getSyncsByConnectionId = async (nangoConnectionId: number): Promise<Sync[] | null> => {
    const results = await db.knex.select('*').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId, deleted: false });

    if (Array.isArray(results) && results.length > 0) {
        return results;
    }

    return null;
};

export const getSyncsByProviderConfigKey = async (environment_id: number, providerConfigKey: string): Promise<SyncWithConnectionId[]> => {
    const results = await db.knex
        .select(`${TABLE}.*`, `${TABLE}.name`, `_nango_connections.connection_id`, `${TABLE}.created_at`, `${TABLE}.updated_at`, `${TABLE}.last_sync_date`)
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
    const results = await db.knex.select('name').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId, deleted: false });

    if (Array.isArray(results) && results.length > 0) {
        return results.map((sync) => sync.name);
    }

    return [];
};

export const getSyncsByProviderConfigAndSyncNames = async (
    environment_id: number,
    providerConfigKey: string,
    syncNames: string[]
): Promise<SyncWithConnectionId[]> => {
    const results = await db.knex
        .select(`${TABLE}.*`, '_nango_connections.connection_id')
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

export const isSyncValid = async (connection_id: string, provider_config_key: string, environment_id: number, sync_id: string): Promise<boolean> => {
    const result = await schema()
        .select('*')
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            environment_id,
            [`${TABLE}.id`]: sync_id,
            connection_id,
            provider_config_key,
            [`_nango_connections.deleted`]: false,
            [`${TABLE}.deleted`]: false
        });

    if (result.length === 0) {
        return false;
    }

    return true;
};

export const softDeleteSync = async (syncId: string): Promise<string> => {
    await schema().from<Sync>(TABLE).where({ id: syncId, deleted: false }).update({ deleted: true, deleted_at: new Date() });
    return syncId;
};

export const findSyncByConnections = async (connectionIds: number[], sync_name: string): Promise<Sync[]> => {
    const results = await schema()
        .select(`${TABLE}.*`)
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

export const getSyncsBySyncConfigId = async (environmentId: number, syncConfigId: number): Promise<Sync[]> => {
    const results = await schema()
        .select('sync_name', `${TABLE}.id`)
        .from<Sync>(TABLE)
        .join(SYNC_CONFIG_TABLE, `${TABLE}.sync_config_id`, `${SYNC_CONFIG_TABLE}.id`)
        .where({
            [`${SYNC_CONFIG_TABLE}.environment_id`]: environmentId,
            [`${SYNC_CONFIG_TABLE}.id`]: syncConfigId,
            [`${TABLE}.deleted`]: false,
            [`${SYNC_CONFIG_TABLE}.deleted`]: false,
            [`${SYNC_CONFIG_TABLE}.active`]: true
        });

    return results;
};

export const getAndReconcileDifferences = async ({
    environmentId,
    flows,
    performAction,
    debug = false,
    singleDeployMode = false,
    logCtx,
    logContextGetter,
    orchestrator
}: {
    environmentId: number;
    flows: IncomingFlowConfig[];
    performAction: boolean;
    debug?: boolean | undefined;
    singleDeployMode?: boolean | undefined;
    logCtx?: LogContext;
    logContextGetter: LogContextGetter;
    orchestrator: Orchestrator;
}): Promise<SyncAndActionDifferences | null> => {
    const newSyncs: SlimSync[] = [];
    const newActions: SlimAction[] = [];
    const syncsToCreate: CreateSyncArgs[] = [];

    const existingSyncsByProviderConfig: Record<string, SlimSync[]> = {};
    const existingConnectionsByProviderConfig: Record<string, NangoConnection[]> = {};

    for (const flow of flows) {
        const { syncName: flowName, providerConfigKey, type } = flow;
        if (type === 'action') {
            const actionExists = await getActionConfigByNameAndProviderConfigKey(environmentId, flowName, providerConfigKey);
            if (!actionExists) {
                newActions.push({
                    name: flowName,
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

        const exists = currentSync?.find((existingSync) => existingSync.name === flowName);
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
        if (exists && exists.enabled && connections.length > 0) {
            syncsByConnection = await findSyncByConnections(
                connections.map((connection) => connection.id as number),
                flowName
            );
            isNew = syncsByConnection.length === 0;
        }

        if (!exists || isNew) {
            newSyncs.push({
                name: flowName,
                providerConfigKey,
                connections: existingConnectionsByProviderConfig[providerConfigKey]?.length as number,
                auto_start: flow.auto_start === false ? false : true
            });
            if (performAction) {
                if (debug) {
                    await logCtx?.debug(`Creating sync ${flowName} for ${providerConfigKey} with ${connections.length} connections and initiating`);
                }
                syncsToCreate.push({ connections, syncName: flowName, sync: flow, providerConfigKey, environmentId });
            }
        }

        // in some cases syncs are missing so let's also create them if missing
        if (performAction && !exists?.enabled && syncsByConnection.length !== 0 && syncsByConnection.length !== connections.length) {
            const missingConnections = connections.filter((connection) => {
                return !syncsByConnection.find((sync) => sync.nango_connection_id === connection.id);
            });

            if (missingConnections.length > 0) {
                if (debug) {
                    await logCtx?.debug(`Creating sync ${flowName} for ${providerConfigKey} with ${missingConnections.length} connections`);
                }
                syncsToCreate.push({ connections: missingConnections, syncName: flowName, sync: flow, providerConfigKey, environmentId });
            }
        }
    }

    if (syncsToCreate.length > 0) {
        if (debug) {
            const syncNames = syncsToCreate.map((sync) => sync.syncName);
            await logCtx?.debug(`Creating ${syncsToCreate.length} sync${syncsToCreate.length === 1 ? '' : 's'} ${JSON.stringify(syncNames)}`);
        }
        // this is taken out of the loop to ensure it awaits all the calls properly
        const result = await syncManager.createSyncs(syncsToCreate, logContextGetter, orchestrator, debug, logCtx);

        if (!result) {
            await logCtx?.failed();
            return null;
        }
    }

    // we don't want to include pre built syncs as they are handled differently hence
    // the "custom" sync configs
    const existingSyncs = await getActiveCustomSyncConfigsByEnvironmentId(environmentId);

    const deletedSyncs: SlimSync[] = [];
    const deletedActions: SlimAction[] = [];
    const deletedModels: string[] = [];

    if (!singleDeployMode) {
        for (const existingSync of existingSyncs) {
            const flow = flows.find((sync) => sync.syncName === existingSync.sync_name && sync.providerConfigKey === existingSync.unique_key);
            const connections = await connectionService.getConnectionsByEnvironmentAndConfig(environmentId, existingSync.unique_key);

            if (!flow) {
                if (existingSync.type === 'sync') {
                    deletedSyncs.push({
                        name: existingSync.sync_name,
                        providerConfigKey: existingSync.unique_key,
                        connections: connections.length,
                        auto_start: false
                    });
                } else {
                    deletedActions.push({
                        name: existingSync.sync_name,
                        providerConfigKey: existingSync.unique_key
                    });
                }

                if (performAction) {
                    if (debug) {
                        await logCtx?.debug(`Deleting sync ${existingSync.sync_name} for ${existingSync.unique_key} with ${connections.length} connections`);
                    }
                    await syncManager.deleteConfig(existingSync.id, environmentId);

                    if (existingSync.type === 'sync') {
                        for (const connection of connections) {
                            const syncId = await getSyncByIdAndName(connection.id as number, existingSync.sync_name);
                            if (syncId) {
                                await syncManager.softDeleteSync(syncId.id, environmentId, orchestrator);
                            }
                        }
                    }

                    if (logCtx) {
                        const connectionDescription =
                            existingSync.type === 'sync' ? ` with ${connections.length} connection${connections.length > 1 ? 's' : ''}.` : '.';
                        const content = `Successfully deleted ${existingSync.type} ${existingSync.sync_name} for ${existingSync.unique_key}${connectionDescription}`;

                        await logCtx?.info(content);
                    }
                }
            } else {
                if (existingSync.type === 'sync') {
                    const missingModels = existingSync.models.filter((model) => !flow.models.includes(model));
                    // we only consider the model as missing if there are connections
                    if (connections.length > 0) {
                        deletedModels.push(...missingModels);
                    }
                }
            }
        }
    }

    if (debug) {
        await logCtx?.debug('Sync deploy diff in debug mode process complete successfully.');
    }

    return {
        newSyncs,
        newActions,
        deletedSyncs,
        deletedActions,
        deletedModels
    };
};

export async function findRecentlyDeletedSync(): Promise<{ id: string; environmentId: number; connectionId: number; models: string[] }[]> {
    const q = db.knex
        .from('_nango_syncs')
        .select<
            { id: string; environmentId: number; connectionId: number; models: string[] }[]
        >('_nango_syncs.id as id', '_nango_connections.environment_id as environmentId', '_nango_connections.id as connectionId', '_nango_sync_configs.models as models')
        .join('_nango_connections', '_nango_connections.id', '_nango_syncs.nango_connection_id')
        .join('_nango_sync_configs', '_nango_sync_configs.id', '_nango_syncs.sync_config_id')
        .where(db.knex.raw("_nango_syncs.deleted_at >  NOW() - INTERVAL '6h'"));
    return await q;
}

export async function trackFetch(nango_connection_id: number): Promise<void> {
    await db.knex.from<Sync>(`_nango_syncs`).where({ nango_connection_id, deleted: false }).update({ last_fetched_at: new Date() });
}
