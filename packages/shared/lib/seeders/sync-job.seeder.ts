import db from '@nangohq/database';
import * as jobService from '../services/sync/job.service.js';
import type { Job } from '../models/Sync.js';
import { SyncType, SyncStatus } from '../models/Sync.js';

export const createSyncJobSeeds = async (syncId: string): Promise<Job> => {
    return (await jobService.createSyncJob(syncId, SyncType.INITIAL, SyncStatus.RUNNING, '', null)) as Job;
};

export const deleteAllSyncJobSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_sync_jobs CASCADE');
};
