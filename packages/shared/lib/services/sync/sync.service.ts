import { v4 as uuidv4 } from 'uuid';
import db, { schema, dbNamespace } from '../../db/database.js';
import { Sync, Job as SyncJob, SyncStatus, SyncConfig } from '../../models/Sync.js';

const TABLE = dbNamespace + 'syncs';
const SYNC_JOB_TABLE = dbNamespace + 'sync_jobs';
const SYNC_CONFIG_TABLE = dbNamespace + 'sync_configs';

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
    const sync = await getSync(nangoConnectionId, syncName);

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

export const getSync = async (nangoConnectionId: number, name: string): Promise<Sync | null> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId, name });

    if (Array.isArray(result) && result.length > 0) {
        return result[0] as Sync;
    }

    return null;
};

export const getSyncs = async (nangoConnectionId: number): Promise<Sync[]> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(TABLE).where({ nango_connection_id: nangoConnectionId });

    if (Array.isArray(result) && result.length > 0) {
        return result;
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
