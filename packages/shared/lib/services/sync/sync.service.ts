import { v4 as uuidv4 } from 'uuid';
import db, { schema, dbNamespace } from '@nangohq/database';
import type { IncomingFlowConfig, SyncAndActionDifferences, Sync, Job as SyncJob, SyncWithSchedule, SlimSync, SlimAction } from '../../models/Sync.js';
import { SyncConfigType, SyncStatus, SyncCommand, ScheduleStatus } from '../../models/Sync.js';
import type { Connection, NangoConnection } from '../../models/Connection.js';
import SyncClient from '../../clients/sync.client.js';
import { updateSuccess as updateSuccessActivityLog, createActivityLogMessage, createActivityLogMessageAndEnd } from '../activity/activity.service.js';
import { updateScheduleStatus } from './schedule.service.js';
import type { ActiveLogIds } from '@nangohq/types';
import telemetry, { LogTypes } from '../../utils/telemetry.js';
import {
    getActiveCustomSyncConfigsByEnvironmentId,
    getSyncConfigsByProviderConfigKey,
    getActionConfigByNameAndProviderConfigKey
} from './config/config.service.js';
import syncManager from './manager.service.js';
import connectionService from '../connection.service.js';
import { DEMO_GITHUB_CONFIG_KEY, DEMO_SYNC_NAME } from '../onboarding.service.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { LogActionEnum } from '../../models/Activity.js';
import type { Orchestrator } from '../../clients/orchestrator.js';
import { featureFlags } from '../../index.js';
import { stringifyError } from '@nangohq/utils';

const TABLE = dbNamespace + 'syncs';
const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';
const SYNC_SCHEDULE_TABLE = dbNamespace + 'sync_schedules';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';
const ACTIVITY_LOG_TABLE = dbNamespace + 'activity_logs';
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

export const createSync = async (nangoConnectionId: number, name: string): Promise<Sync | null> => {
    const existingSync = await getSyncByIdAndName(nangoConnectionId, name);

    if (existingSync) {
        return null;
    }

    const sync: Sync = {
        id: uuidv4(),
        nango_connection_id: nangoConnectionId,
        name,
        frequency: null,
        last_sync_date: null,
        last_fetched_at: null
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
export const getSyncs = async (
    nangoConnection: Connection,
    orchestrator: Orchestrator
): Promise<(Sync & { status: SyncStatus; active_logs: ActiveLogIds })[]> => {
    const syncClient = await SyncClient.getInstance();

    if (!syncClient || !nangoConnection || !nangoConnection.id) {
        return [];
    }

    const q = db.knex
        .from<Sync>(TABLE)
        .select(
            `${TABLE}.*`,
            `${TABLE}.frequency as frequency_override`,
            `${SYNC_SCHEDULE_TABLE}.schedule_id`,
            `${SYNC_SCHEDULE_TABLE}.frequency`,
            `${SYNC_SCHEDULE_TABLE}.offset`,
            `${SYNC_SCHEDULE_TABLE}.status as schedule_status`,
            `${SYNC_CONFIG_TABLE}.models`,
            `${ACTIVE_LOG_TABLE}.activity_log_id as error_activity_log_id`,
            `${ACTIVE_LOG_TABLE}.log_id as error_log_id`,
            db.knex.raw(`
                CASE
                    WHEN COUNT(${ACTIVE_LOG_TABLE}.activity_log_id) = 0 THEN NULL
                    ELSE json_build_object(
                        'activity_log_id', ${ACTIVE_LOG_TABLE}.activity_log_id,
                        'log_id', ${ACTIVE_LOG_TABLE}.log_id
                    )
                END as active_logs
            `),
            db.knex.raw(
                `(
                    SELECT json_build_object(
                        'job_id', ${SYNC_JOB_TABLE}.id,
                        'created_at', ${SYNC_JOB_TABLE}.created_at,
                        'updated_at', ${SYNC_JOB_TABLE}.updated_at,
                        'type', ${SYNC_JOB_TABLE}.type,
                        'result', ${SYNC_JOB_TABLE}.result,
                        'status', ${SYNC_JOB_TABLE}.status,
                        'sync_config_id', ${SYNC_JOB_TABLE}.sync_config_id,
                        'version', ${SYNC_CONFIG_TABLE}.version,
                        'models', ${SYNC_CONFIG_TABLE}.models,
                        'activity_log_id', ${ACTIVITY_LOG_TABLE}.id
                    )
                    FROM ${SYNC_JOB_TABLE}
                    JOIN ${SYNC_CONFIG_TABLE} ON ${SYNC_CONFIG_TABLE}.id = ${SYNC_JOB_TABLE}.sync_config_id AND ${SYNC_CONFIG_TABLE}.deleted = false
                    LEFT JOIN ${ACTIVITY_LOG_TABLE} ON ${ACTIVITY_LOG_TABLE}.session_id = ${SYNC_JOB_TABLE}.id::text
                    WHERE ${SYNC_JOB_TABLE}.sync_id = ${TABLE}.id
                        AND ${SYNC_JOB_TABLE}.deleted = false
                    ORDER BY ${SYNC_JOB_TABLE}.updated_at DESC
                    LIMIT 1
                ) as latest_sync
                `
            )
        )
        .join(SYNC_SCHEDULE_TABLE, function () {
            this.on(`${SYNC_SCHEDULE_TABLE}.sync_id`, `${TABLE}.id`).andOn(`${SYNC_SCHEDULE_TABLE}.deleted`, '=', db.knex.raw('FALSE'));
        })
        .leftJoin(ACTIVE_LOG_TABLE, function () {
            this.on(`${ACTIVE_LOG_TABLE}.sync_id`, `${TABLE}.id`).andOnVal(`${ACTIVE_LOG_TABLE}.active`, true).andOnVal(`${ACTIVE_LOG_TABLE}.type`, 'sync');
        })
        .join(SYNC_CONFIG_TABLE, function () {
            this.on(`${SYNC_CONFIG_TABLE}.sync_name`, `${TABLE}.name`)
                .andOn(`${SYNC_CONFIG_TABLE}.deleted`, '=', db.knex.raw('FALSE'))
                .andOn(`${SYNC_CONFIG_TABLE}.active`, '=', db.knex.raw('TRUE'))
                .andOn(`${SYNC_CONFIG_TABLE}.type`, '=', db.knex.raw('?', 'sync'))
                .andOn(`${SYNC_CONFIG_TABLE}.nango_config_id`, '=', db.knex.raw('?', [nangoConnection.config_id]));
        })
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            nango_connection_id: nangoConnection.id,
            [`${SYNC_CONFIG_TABLE}.nango_config_id`]: nangoConnection.config_id,
            [`${TABLE}.deleted`]: false
        })
        .orderBy(`${TABLE}.name`, 'asc')
        .groupBy(
            `${TABLE}.id`,
            `${SYNC_SCHEDULE_TABLE}.frequency`,
            `${ACTIVE_LOG_TABLE}.activity_log_id`,
            `${ACTIVE_LOG_TABLE}.log_id`,
            `${SYNC_SCHEDULE_TABLE}.offset`,
            `${SYNC_SCHEDULE_TABLE}.status`,
            `${SYNC_SCHEDULE_TABLE}.schedule_id`,
            `${SYNC_CONFIG_TABLE}.models`
        );

    const result = await q;

    const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:schedule', 'global', false);
    const isEnvEnabled = await featureFlags.isEnabled('orchestrator:schedule', `${nangoConnection.environment_id}`, false);
    const isOrchestrator = isGloballyEnabled || isEnvEnabled;
    if (isOrchestrator) {
        const searchSchedulesProps = result.map((sync) => {
            return { syncId: sync.id, environmentId: nangoConnection.environment_id };
        });
        const schedules = await orchestrator.searchSchedules(searchSchedulesProps);
        if (schedules.isErr()) {
            throw new Error(`Failed to get schedules for environment ${nangoConnection.environment_id}: ${stringifyError(schedules.error)}`);
        }
        return result.map((sync) => {
            const schedule = schedules.value.get(sync.id);
            if (schedule) {
                return {
                    ...sync,
                    status: syncManager.classifySyncStatus(sync?.latest_sync?.status, schedule.state),
                    futureActionTimes: schedule.state === 'PAUSED' ? [] : [schedule.nextDueDate.getTime() / 1000]
                };
            }
            return sync;
        });
    } else {
        const syncsWithSchedule = result.map(async (sync) => {
            const { schedule_id } = sync;
            const syncSchedule = await syncClient?.describeSchedule(schedule_id);

            if (syncSchedule) {
                if (syncSchedule.schedule?.state?.paused && sync.schedule_status === SyncStatus.RUNNING) {
                    sync = {
                        ...sync,
                        schedule_status: SyncStatus.PAUSED
                    };
                    await updateScheduleStatus(schedule_id, SyncCommand.PAUSE, null, nangoConnection.environment_id);
                    await telemetry.log(
                        LogTypes.TEMPORAL_SCHEDULE_MISMATCH_NOT_RUNNING,
                        'UI: Schedule is marked as paused in temporal but not in the database. The schedule has been updated in the database to be paused.',
                        LogActionEnum.SYNC,
                        {
                            environmentId: String(nangoConnection.environment_id),
                            syncName: sync.name,
                            connectionId: nangoConnection.connection_id,
                            providerConfigKey: nangoConnection.provider_config_key,
                            syncId: sync.id,
                            syncJobId: String(sync.latest_sync?.job_id),
                            scheduleId: schedule_id,
                            level: 'warn'
                        },
                        `syncId:${sync.id}`
                    );
                } else if (!syncSchedule.schedule?.state?.paused && sync.schedule_status === SyncStatus.PAUSED) {
                    sync = {
                        ...sync,
                        schedule_status: SyncStatus.RUNNING
                    };
                    await updateScheduleStatus(schedule_id, SyncCommand.UNPAUSE, null, nangoConnection.environment_id);
                    await telemetry.log(
                        LogTypes.TEMPORAL_SCHEDULE_MISMATCH_NOT_PAUSED,
                        'UI: Schedule is marked as running in temporal but not in the database. The schedule has been updated in the database to be running.',
                        LogActionEnum.SYNC,
                        {
                            environmentId: String(nangoConnection.environment_id),
                            syncName: sync.name,
                            connectionId: nangoConnection.connection_id,
                            providerConfigKey: nangoConnection.provider_config_key,
                            syncId: sync.id,
                            syncJobId: String(sync.latest_sync?.job_id),
                            scheduleId: schedule_id,
                            level: 'warn'
                        },
                        `syncId:${sync.id}`
                    );
                }
            }
            let futureActionTimes: number[] = [];
            if (sync.schedule_status !== SyncStatus.PAUSED && syncSchedule && syncSchedule.info?.futureActionTimes) {
                futureActionTimes = syncSchedule.info.futureActionTimes.map((long) => long.seconds?.toNumber()) as number[];
            }

            return {
                ...sync,
                status: syncManager.legacyClassifySyncStatus(sync?.latest_sync?.status, sync?.schedule_status),
                futureActionTimes
            };
        });

        if (Array.isArray(syncsWithSchedule) && syncsWithSchedule.length > 0) {
            return Promise.all(syncsWithSchedule);
        }

        return [];
    }
};

export const getSyncsByConnectionId = async (nangoConnectionId: number): Promise<Sync[] | null> => {
    const results = await db.knex.select('*').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId, deleted: false });

    if (Array.isArray(results) && results.length > 0) {
        return results;
    }

    return null;
};

type SyncWithConnectionId = Sync & { connection_id: string };

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

export const getSyncsByProviderConfigAndSyncNames = async (environment_id: number, providerConfigKey: string, syncNames: string[]): Promise<Sync[]> => {
    const results = await db.knex
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
        .join(SYNC_CONFIG_TABLE, `${TABLE}.name`, `${SYNC_CONFIG_TABLE}.sync_name`)
        .where({
            environment_id: environmentId,
            [`${SYNC_CONFIG_TABLE}.id`]: syncConfigId,
            [`${TABLE}.deleted`]: false,
            [`${SYNC_CONFIG_TABLE}.deleted`]: false,
            [`${SYNC_CONFIG_TABLE}.active`]: true
        });

    return results;
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

export const getAndReconcileDifferences = async ({
    environmentId,
    flows,
    performAction,
    activityLogId,
    debug = false,
    singleDeployMode = false,
    logCtx,
    logContextGetter,
    orchestrator
}: {
    environmentId: number;
    flows: IncomingFlowConfig[];
    performAction: boolean;
    activityLogId: number | null;
    debug?: boolean | undefined;
    singleDeployMode?: boolean | undefined;
    logCtx?: LogContext;
    logContextGetter: LogContextGetter;
    orchestrator: Orchestrator;
}): Promise<SyncAndActionDifferences | null> => {
    const newSyncs: SlimSync[] = [];
    const newActions: SlimAction[] = [];
    const syncsToCreate = [];

    const existingSyncsByProviderConfig: Record<string, SlimSync[]> = {};
    const existingConnectionsByProviderConfig: Record<string, NangoConnection[]> = {};

    for (const flow of flows) {
        const { syncName: flowName, providerConfigKey, type } = flow;
        if (type === SyncConfigType.ACTION) {
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
                if (debug && activityLogId) {
                    await createActivityLogMessage({
                        level: 'debug',
                        environment_id: environmentId,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content: `Creating sync ${flowName} for ${providerConfigKey} with ${connections.length} connections and initiating`
                    });
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
                if (debug && activityLogId) {
                    await createActivityLogMessage({
                        level: 'debug',
                        environment_id: environmentId,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content: `Creating sync ${flowName} for ${providerConfigKey} with ${missingConnections.length} connections`
                    });
                    await logCtx?.debug(`Creating sync ${flowName} for ${providerConfigKey} with ${missingConnections.length} connections`);
                }
                syncsToCreate.push({ connections: missingConnections, syncName: flowName, sync: flow, providerConfigKey, environmentId });
            }
        }
    }

    if (syncsToCreate.length > 0) {
        if (debug && activityLogId) {
            const syncNames = syncsToCreate.map((sync) => sync.syncName);
            await createActivityLogMessage({
                level: 'debug',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `Creating ${syncsToCreate.length} sync${syncsToCreate.length === 1 ? '' : 's'} ${JSON.stringify(syncNames, null, 2)}`
            });
            await logCtx?.debug(`Creating ${syncsToCreate.length} sync${syncsToCreate.length === 1 ? '' : 's'} ${JSON.stringify(syncNames)}`);
        }
        // this is taken out of the loop to ensure it awaits all the calls properly
        const result = await syncManager.createSyncs(syncsToCreate, logContextGetter, orchestrator, debug, activityLogId!, logCtx);

        if (!result) {
            if (activityLogId) {
                await updateSuccessActivityLog(activityLogId, false);
                await logCtx?.failed();
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
            const exists = flows.find((sync) => sync.syncName === existingSync.sync_name && sync.providerConfigKey === existingSync.unique_key);

            if (!exists) {
                const connections = await connectionService.getConnectionsByEnvironmentAndConfig(environmentId, existingSync.unique_key);
                if (existingSync.type === SyncConfigType.SYNC) {
                    deletedSyncs.push({
                        name: existingSync.sync_name,
                        providerConfigKey: existingSync.unique_key,
                        connections: connections.length
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
                            activity_log_id: activityLogId,
                            timestamp: Date.now(),
                            content: `Deleting sync ${existingSync.sync_name} for ${existingSync.unique_key} with ${connections.length} connections`
                        });
                        await logCtx?.debug(`Deleting sync ${existingSync.sync_name} for ${existingSync.unique_key} with ${connections.length} connections`);
                    }
                    await syncManager.deleteConfig(existingSync.id, environmentId);

                    if (existingSync.type === SyncConfigType.SYNC) {
                        for (const connection of connections) {
                            const syncId = await getSyncByIdAndName(connection.id as number, existingSync.sync_name);
                            if (syncId) {
                                await syncManager.softDeleteSync(syncId.id, environmentId, orchestrator);
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
                            activity_log_id: activityLogId,
                            timestamp: Date.now(),
                            content
                        });
                        await logCtx?.debug(content);
                    }
                }
            }
        }
    }

    if (debug && activityLogId) {
        await createActivityLogMessageAndEnd({
            level: 'debug',
            environment_id: environmentId,
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: 'Sync deploy diff in debug mode process complete successfully.'
        });
        await logCtx?.debug('Sync deploy diff in debug mode process complete successfully.');
    }

    return {
        newSyncs,
        newActions,
        deletedSyncs,
        deletedActions
    };
};

export interface PausableSyncs {
    id: string;
    name: string;
    config_id: number;
    provider_unique_key: string;
    provider: string;
    environment_id: number;
    environment_name: string;
    account_id: number;
    account_name: string;
    sync_config_id: number;
    connection_unique_id: number;
    connection_id: string;
    unique_key: string;
    schedule_id: string;
}
export async function findPausableDemoSyncs(): Promise<PausableSyncs[]> {
    const q = db.knex
        .queryBuilder()
        .from('_nango_syncs')
        .select(
            '_nango_syncs.id',
            '_nango_syncs.name',
            '_nango_accounts.id as account_id',
            '_nango_accounts.name as account_name',
            '_nango_environments.id as environment_id',
            '_nango_environments.name as environment_name',
            '_nango_configs.id as config_id',
            '_nango_configs.provider',
            '_nango_configs.unique_key as provider_unique_key',
            '_nango_connections.id as connection_unique_id',
            '_nango_connections.connection_id',
            '_nango_sync_schedules.schedule_id',
            '_nango_sync_configs.id as sync_config_id'
        )
        .join('_nango_connections', '_nango_connections.id', '_nango_syncs.nango_connection_id')
        .join('_nango_environments', '_nango_environments.id', '_nango_connections.environment_id')
        .join('_nango_accounts', '_nango_accounts.id', '_nango_environments.account_id')
        .join('_nango_configs', function () {
            this.on('_nango_configs.environment_id', '_nango_connections.environment_id').on(
                '_nango_configs.unique_key',
                '_nango_connections.provider_config_key'
            );
        })
        .join('_nango_sync_configs', function () {
            this.on('_nango_sync_configs.environment_id', '_nango_environments.id')
                .on('_nango_sync_configs.nango_config_id', '_nango_configs.id')
                .on('_nango_sync_configs.sync_name', '_nango_syncs.name')
                .onVal('_nango_sync_configs.type', 'sync')
                .onVal('_nango_sync_configs.deleted', false)
                .onVal('_nango_sync_configs.active', true);
        })
        .join('_nango_sync_schedules', '_nango_sync_schedules.sync_id', '_nango_syncs.id')
        .where({
            '_nango_syncs.name': DEMO_SYNC_NAME,
            '_nango_environments.name': 'dev',
            '_nango_configs.unique_key': DEMO_GITHUB_CONFIG_KEY,
            '_nango_configs.provider': 'github',
            '_nango_syncs.deleted': false,
            '_nango_sync_schedules.status': ScheduleStatus.RUNNING
        })
        .where(db.knex.raw("_nango_syncs.updated_at <  NOW() - INTERVAL '25h'"));
    const syncs: PausableSyncs[] = await q;

    return syncs;
}

export async function findRecentlyDeletedSync(): Promise<{ id: string }[]> {
    const q = db.knex.from('_nango_syncs').select<{ id: string }[]>('_nango_syncs.id').where(db.knex.raw("_nango_syncs.deleted_at >  NOW() - INTERVAL '6h'"));
    return await q;
}

export async function trackFetch(nango_connection_id: number): Promise<void> {
    await db.knex.from<Sync>(`_nango_syncs`).where({ nango_connection_id, deleted: false }).update({ last_fetched_at: new Date() });
}
