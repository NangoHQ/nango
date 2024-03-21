import db from '../database.js';
import * as jobService from '../../services/sync/job.service.js';
import { createSyncSeeds } from './sync.seeder.js';
import type { Job } from '../../models/Sync.js';
import { SyncType, SyncStatus } from '../../models/Sync.js';

export const createSyncJobSeeds = async (connectionId = 1): Promise<Job> => {
    const sync = await createSyncSeeds(connectionId);
    return (await jobService.createSyncJob(sync.id as string, SyncType.INITIAL, SyncStatus.RUNNING, '', null)) as Job;
};

export const deleteAllSyncJobSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_sync_jobs CASCADE');
};
