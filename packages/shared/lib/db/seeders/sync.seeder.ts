import db from '../database.js';
import * as syncService from '../../services/sync/sync.service.js';
import type { Sync } from '../../models/Sync.js';

export const create = async (): Promise<Sync> => {
    const syncName = Math.random().toString(36).substring(7);
    return (await syncService.createSync(1, syncName)) as Sync;
};

export const deleteAll = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE nango._nango_syncs CASCADE');
};
