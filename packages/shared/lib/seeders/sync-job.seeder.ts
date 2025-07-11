import db from '@nangohq/database';

import { SyncJobsType, SyncStatus } from '../models/Sync.js';
import * as jobService from '../services/sync/job.service.js';

import type { Job } from '../models/Sync.js';

export const createSyncJobSeeds = async (syncId: string): Promise<Job> => {
    return (await jobService.createSyncJob({ sync_id: syncId, type: SyncJobsType.FULL, status: SyncStatus.RUNNING, job_id: '', nangoConnection: null })) as Job;
};

export const deleteAllSyncJobSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_sync_jobs CASCADE');
};
