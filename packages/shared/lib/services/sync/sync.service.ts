import { v4 as uuidv4 } from 'uuid';
import db, { schema, dbNamespace } from '../../db/database.js';
import { SyncReconciliationParams, Sync, Job as SyncJob, SyncStatus, SyncWithSchedule } from '../../models/Sync.js';
import type { Connection, NangoConnection } from '../../models/Connection.js';
import SyncClient from '../../clients/sync.client.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import { markAllAsStopped } from './schedule.service.js';
import connectionService from '../connection.service.js';
import configService from '../config.service.js';

const TABLE = dbNamespace + 'syncs';
const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';
const SYNC_SCHEDULE_TABLE = dbNamespace + 'sync_schedules';

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
    const connections: NangoConnection[] = await connectionService.getConnectionsByAccountAndConfig(accountId, providerConfigKey);
    const syncs: Sync[] = [];
    for (const connection of connections) {
        const existingSync = await getSyncsByConnectionId(connection.id as number);
        if (existingSync) {
            syncs.push(...existingSync);
        }
    }

    return syncs;
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

/**
 * Reconcile Syncs
 * @desc if syncs are new then initiate them, if they are deleted then delete them
 *
 */
export const reconcileSyncs = async (account_id: number, syncs: SyncReconciliationParams[]): Promise<{ createdSyncs: (Sync | null)[] }> => {
    const createdSyncs = [];
    for (const sync of syncs) {
        const { syncName, providerConfigKey, returns } = sync;

        // get all the connection ids for this provider
        const connections: NangoConnection[] = await connectionService.getConnectionsByAccountAndConfig(account_id, providerConfigKey);

        for (const connection of connections) {
            const existingSync = await getSyncByIdAndName(connection.id as number, syncName);

            if (!existingSync) {
                const createdSync = await createSync(connection.id as number, syncName, returns);
                createdSyncs.push(createdSync);
                const syncConfig = await configService.getProviderConfig(providerConfigKey, account_id);
                const syncClient = await SyncClient.getInstance();
                syncClient?.startContinuous(connection, createdSync as Sync, syncConfig as ProviderConfig, syncName, sync);
            }
        }
    }

    // TODO if something was removed then delete it and stop the sync

    return { createdSyncs };
};
