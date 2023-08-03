import db from '../database.js';
import * as jobService from '../../services/sync/job.service.js';
import { create as createSync } from './sync.seeder.js';
import { Job, SyncType, SyncStatus } from '../../models/Sync.js';

export const create = async (): Promise<Job> => {
    const sync = await createSync();
    return (await jobService.createSyncJob(sync.id as string, SyncType.INITIAL, SyncStatus.RUNNING, '', null)) as Job;
};

export const deleteAll = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE nango._nango_sync_jobs CASCADE');
};
