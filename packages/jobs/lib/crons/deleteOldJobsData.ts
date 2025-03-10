import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum, deleteJobsByDate } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';
import { setTimeout } from 'node:timers/promises';
import { envs } from '../env.js';
import { getLocking } from '@nangohq/kvstore';

const logger = getLogger('Jobs.deleteOldsJobs');

const limit = envs.CRON_DELETE_OLD_JOBS_LIMIT;
const cronMinutes = envs.CRON_DELETE_OLD_JOBS_EVERY_MIN;
const deleteJobsOlderThan = envs.CRON_DELETE_OLD_JOBS_MAX_DAYS;

export function deleteOldJobsData(): void {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    cron.schedule(`*/${cronMinutes} * * * *`, async () => {
        const start = Date.now();
        try {
            await exec();

            logger.info('✅ done');
        } catch (err) {
            const e = new Error('failed_to_hard_delete_old_jobs_data', { cause: err instanceof Error ? err.message : err });
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM });
        }
        metrics.duration(metrics.Types.JOBS_DELETE_OLD_JOBS_DATA, Date.now() - start);
    });
}

export async function exec(): Promise<void> {
    const locking = await getLocking();

    await tracer.trace<Promise<void>>('nango.server.cron.deleteOldJobs', async () => {
        logger.info(`Starting`);

        const ttlMs = (cronMinutes - 1) * 60 * 1000;
        const startTimestamp = Date.now();
        const lockKey = `lock:deleteOldJobs:cron`;

        try {
            await locking.acquire(lockKey, ttlMs);
        } catch {
            logger.info(`Could not acquire lock, skipping`);
            return;
        }

        while (true) {
            const deleted = await deleteJobsByDate({ deleteJobsOlderThan, limit });
            logger.info(`Deleted ${deleted} jobs`);
            if (deleted <= 0) {
                break;
            }
            if (Date.now() - startTimestamp > ttlMs) {
                logger.info(`Time limit reached, stopping`);
                break;
            }
            await setTimeout(1000);
        }
    });
}
