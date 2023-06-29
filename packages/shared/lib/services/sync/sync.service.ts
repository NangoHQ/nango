import { v4 as uuidv4 } from 'uuid';
import db, { schema, dbNamespace } from '../../db/database.js';
import { IncomingSyncConfig, SyncDifferences, Sync, Job as SyncJob, SyncStatus, SyncWithSchedule, SlimSync } from '../../models/Sync.js';
import type { Connection, NangoConnection } from '../../models/Connection.js';
import SyncClient from '../../clients/sync.client.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import { markAllAsStopped, deleteScheduleForSync } from './schedule.service.js';
import { getActiveSyncConfigsByAccountId, getSyncConfigsByProviderConfigKey } from './config.service.js';
import syncOrchestrator from './orchestrator.service.js';
import connectionService from '../connection.service.js';
import configService from '../config.service.js';

const TABLE = dbNamespace + 'syncs';
const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';
const SYNC_SCHEDULE_TABLE = dbNamespace + 'sync_schedules';

interface ReconciledSyncResult {
    createdSyncs: (Sync | null)[];
    deletedSyncs: {
        id: string;
        name: string;
    }[];
}

/**
 * Sync Service
 * @description
 *  A Sync a Nango Sync that has
 *  - collection of sync jobs (initial or incremental)
 *  - sync schedule
 *  - bunch of sync data records
 *
 */

export const getById = async (id: string): Promise<Sync | null> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ id });

    if (!result || result.length == 0 || !result[0]) {
        return null;
    }

    return result[0];
};

export const createSync = async (nangoConnectionId: number, name: string, models: string[]): Promise<Sync | null> => {
    const sync: Sync = {
        id: uuidv4(),
        nango_connection_id: nangoConnectionId,
        name,
        models
    };

    const result = await db.knex.withSchema(db.schema()).from<Sync>(TABLE).insert(sync).returning('*');

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
                        'activity_log_id', nango.${SYNC_JOB_TABLE}.activity_log_id
                    )
                    FROM nango.${SYNC_JOB_TABLE}
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

export const getSyncsByProviderConfigKey = async (accountId: number, providerConfigKey: string): Promise<Sync[]> => {
    const results = await db.knex
        .withSchema(db.schema())
        .select(`${TABLE}.*`)
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            account_id: accountId,
            provider_config_key: providerConfigKey
        });

    return results;
};

export const getSyncsByAccountId = async (accountId: number): Promise<Sync[]> => {
    const results = await db.knex
        .withSchema(db.schema())
        .select('*')
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .join('_nango_sync_configs', '_nango_sync_configs.id', `${TABLE}.nango_sync_config_id`)
        .where({
            account_id: accountId,
            active: true
        });

    return results;
};

/**
 * Verify Ownership
 * @desc verify that the incoming account id matches with the provided nango connection id
 */
export const verifyOwnership = async (nangoConnectionId: number, accountId: number, syncId: string): Promise<boolean> => {
    const result = await schema()
        .select('*')
        .from<Sync>(TABLE)
        .join('_nango_connections', '_nango_connections.id', `${TABLE}.nango_connection_id`)
        .where({
            account_id: accountId,
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

export const getAndReconcileSyncDifferences = async (accountId: number, syncs: IncomingSyncConfig[], performAction: boolean): Promise<SyncDifferences> => {
    const newSyncs: SlimSync[] = [];

    const existingSyncsByProviderConfig: { [key: string]: SlimSync[] } = {};
    const existingConnectionsByProviderConfig: { [key: string]: NangoConnection[] } = {};

    for (const sync of syncs) {
        const { syncName, providerConfigKey, models } = sync;
        if (!existingSyncsByProviderConfig[providerConfigKey]) {
            // this gets syncs that have a sync config and are active OR just have a sync config
            existingSyncsByProviderConfig[providerConfigKey] = await getSyncConfigsByProviderConfigKey(accountId, providerConfigKey);
            existingConnectionsByProviderConfig[providerConfigKey] = await connectionService.getConnectionsByAccountAndConfig(accountId, providerConfigKey);
        }

        const currentSync = existingSyncsByProviderConfig[providerConfigKey];

        const exists = currentSync?.filter((existingSync) => existingSync.name === syncName);
        const connections = existingConnectionsByProviderConfig[providerConfigKey] as Connection[];

        let isNew = false;
        // if it has connections but doesn't have an active sync then it is considered a new sync
        if (connections.length > 0 && exists?.filter((sync) => sync.sync_id !== null).length === 0) {
            isNew = true;
        }

        if (exists?.length === 0 || isNew) {
            newSyncs.push({ name: syncName, providerConfigKey, connections: existingConnectionsByProviderConfig[providerConfigKey]?.length as number });
            if (performAction) {
                for (const connection of connections) {
                    await syncOrchestrator.create(connection, syncName, models, providerConfigKey, accountId, sync);
                }
            }
        }
    }

    const existingSyncs = await getActiveSyncConfigsByAccountId(accountId);
    const deletedSyncs = [];

    for (const existingSync of existingSyncs) {
        const exists = syncs.find((sync) => sync.syncName === existingSync.sync_name && sync.providerConfigKey === existingSync.unique_key);

        if (!exists) {
            const connections = await connectionService.getConnectionsByAccountAndConfig(accountId, existingSync.unique_key);
            deletedSyncs.push({
                name: existingSync.sync_name,
                providerConfigKey: existingSync.unique_key,
                connections: connections?.length as number
            });

            if (performAction) {
                await syncOrchestrator.delete(existingSync.id as number, existingSync.sync_id);
            }
        }
    }

    return {
        newSyncs,
        deletedSyncs
    };
};
