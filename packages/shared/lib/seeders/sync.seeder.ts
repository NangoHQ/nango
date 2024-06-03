import db from '@nangohq/database';
import * as syncService from '../services/sync/sync.service.js';
import type { Sync } from '../models/Sync.js';

export const createSyncSeeds = async (connectionId = 1): Promise<Sync> => {
    const syncName = Math.random().toString(36).substring(7);
    return (await syncService.createSync(connectionId, syncName)) as Sync;
};

export const deleteAllSyncSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_syncs CASCADE');
};
