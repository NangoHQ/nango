import { setTimeout } from 'node:timers/promises';

import tracer from 'dd-trace';
import * as cron from 'node-cron';

import db from '@nangohq/database';
import { deleteExpiredPrivateKeys } from '@nangohq/keystore';
import { getLocking } from '@nangohq/kvstore';
import { deleteJobsByDate } from '@nangohq/shared';
import { getLogger, metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';
import { deleteExpiredConnectSession } from '../services/connectSession.service.js';

import type { Lock } from '@nangohq/kvstore';

const logger = getLogger('cron.deleteOldData');

const cronMinutes = envs.CRON_DELETE_OLD_DATA_EVERY_MIN;

const limit = envs.CRON_DELETE_OLD_JOBS_LIMIT;
const deleteJobsOlderThan = envs.CRON_DELETE_OLD_JOBS_MAX_DAYS;

const deleteConnectionSessionOlderThan = envs.CRON_DELETE_OLD_CONNECT_SESSION_MAX_DAYS;
const deletePrivateKeysOlderThan = envs.CRON_DELETE_OLD_PRIVATE_KEYS_MAX_DAYS;

export function deleteOldData(): void {
    if (envs.CRON_DELETE_OLD_DATA_EVERY_MIN <= 0) {
        return;
    }

    cron.schedule(
        `*/${cronMinutes} * * * *`,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            const start = Date.now();
            try {
                await tracer.trace<Promise<void>>('nango.server.cron.deleteOldData', async () => {
                    await exec();
                });

                logger.info('✅ done');
            } catch (err) {
                report(new Error('cron_failed_to_hard_delete_old_data', { cause: err }));
            }
            metrics.duration(metrics.Types.JOBS_DELETE_OLD_DATA, Date.now() - start);
        }
    );
}

export async function exec(): Promise<void> {
    const locking = await getLocking();

    logger.info(`Starting`);

    const ttlMs = (cronMinutes - 1) * 60 * 1000;
    const startTimestamp = Date.now();
    const lockKey = `lock:deleteOldData:cron`;
    let lock: Lock | undefined;
    try {
        try {
            lock = await locking.acquire(lockKey, ttlMs);
        } catch {
            logger.info(`Could not acquire lock, skipping`);
            return;
        }

        // Delete jobs
        while (true) {
            const deleted = await deleteJobsByDate({ olderThan: deleteJobsOlderThan, limit });
            logger.info(`Deleted ${deleted} jobs`);
            if (deleted < limit) {
                break;
            }
            if (Date.now() - startTimestamp > ttlMs) {
                logger.info(`Time limit reached, stopping`);
                return;
            }
            await setTimeout(1000);
        }

        // Delete connect session
        while (true) {
            const deleted = await deleteExpiredConnectSession(db.knex, { olderThan: deleteConnectionSessionOlderThan, limit });
            logger.info(`Deleted ${deleted} connect session`);
            if (deleted < limit) {
                break;
            }
            if (Date.now() - startTimestamp > ttlMs) {
                logger.info(`Time limit reached, stopping`);
                return;
            }
            await setTimeout(1000);
        }

        // Delete private keys
        while (true) {
            const deleted = await deleteExpiredPrivateKeys(db.knex, { olderThan: deletePrivateKeysOlderThan, limit });
            logger.info(`Deleted ${deleted} private keys`);
            if (deleted < limit) {
                break;
            }
            if (Date.now() - startTimestamp > ttlMs) {
                logger.info(`Time limit reached, stopping`);
                return;
            }
            await setTimeout(1000);
        }
    } finally {
        if (lock) {
            locking.release(lock);
        }
    }
}
