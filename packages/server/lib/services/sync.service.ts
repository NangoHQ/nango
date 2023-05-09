import { Client, Connection } from '@temporalio/client';
//import type { WorkflowStartOptions } from '@temporalio/client';
import db from '../db/database.js';
import { Sync, SyncStatus } from '../models.js';

const table = '_nango_unified_syncs';
const SYNC_NAME = 'continuousSync';

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

    const handle = await client?.workflow.start(SYNC_NAME, {
        taskQueue: 'unified_syncs',
        workflowId: `unified-sync-${sync.id}`,
        args: [
            {
                syncId: sync.id,
                frequencyInMs: 3600000 // 1 hour
            }
        ]
    });

    // log this to the UI somewhere
    console.log(`Started workflow ${handle?.workflowId}`);
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
    const sync = await create(connectionId, providerConfigKey, accountId);
    if (sync) {
        startContinuous(sync);
    }
};

export const create = async (connectionId: string, providerConfigKey: string, accountId: number): Promise<Sync | null> => {
    const result: void | Pick<Sync, 'id'> = await db.knex.withSchema(db.schema()).from<Sync>(table).insert(
        {
            connection_id: connectionId,
            provider_config_key: providerConfigKey,
            account_id: accountId,
            status: SyncStatus.RUNNING
        },
        ['id']
    );

    if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
        const statusId = result[0]['id'];
        return getById(statusId) as unknown as Sync;
    }

    return null;
};

/*
class SyncService {
    private SYNC_NAME = 'continuousSync';

    async getById(id: number): Promise<Sync | null> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<Sync>(table).where({ id: id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async initiate(connectionId: string, providerConfigKey: string, accountId: number): Promise<void> {
        const sync = await this.create(connectionId, providerConfigKey, accountId);
        if (sync) {
            this.startContinuous(sync);
        }
    }

    async create(connectionId: string, providerConfigKey: string, accountId: number): Promise<Sync | null> {
        const result: void | Pick<Sync, 'id'> = await db.knex.withSchema(db.schema()).from<Sync>(table).insert(
            {
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                account_id: accountId,
                status: SyncStatus.RUNNING
            },
            ['id']
        );

        if (Array.isArray(result) && result.length === 1 && result[0] !== null && 'id' in result[0]) {
            const statusId = result[0]['id'];
            return this.getById(statusId) as unknown as Sync;
        }

        return null;
    }

    async edit(sync: Sync) {
        return db.knex.withSchema(db.schema()).from<Sync>(table).where({ id: sync.id }).update({
            status: sync.status
        });
    }

    private async startContinuous(sync: Sync) {
        const client = await getClient();

        const handle = await client.workflow.start(this.SYNC_NAME, {
            taskQueue: 'unified_syncs',
            workflowId: `unified-sync-${sync.id}`,
            args: [
                {
                    syncId: sync.id,
                    frequencyInMs: 3600000 // 1 hour
                }
            ]
        });

        // log this to the UI somewhere
        console.log(`Started workflow ${handle?.workflowId}`);
    }
}

export default new SyncService();
*/
