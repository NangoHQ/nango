import * as cron from 'node-cron';

import { KnexDatabase } from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { timeoutFunctionAsyncJobs } from '@nangohq/sandbox';
import { getLogger, report } from '@nangohq/utils';

import type { Lock } from '@nangohq/kvstore';

const logger = getLogger('cron.timeoutFunctionAsyncJobs');
const cronExpression = '* * * * *';
const lockTtlMs = 55 * 1000;
const maintenanceDb = new KnexDatabase({ timeoutMs: 10000, pool: { min: 0, max: 1, acquireTimeoutMillis: 10000 } });

export function timeoutFunctionAsyncJobsCron(): void {
    cron.schedule(cronExpression, () => {
        exec().catch((err: unknown) => {
            logger.error('Failed to execute function async jobs timeout cron');
            report(new Error('cron_failed_to_timeout_function_async_jobs', { cause: err }));
        });
    });
}

export async function exec(): Promise<void> {
    const locking = await getLocking();
    let lock: Lock | undefined;

    try {
        lock = await locking.acquire('lock:functionAsyncJobsTimeout:cron', lockTtlMs);
    } catch (err) {
        logger.info('Could not acquire lock, skipping', err);
        return;
    }

    try {
        const count = await maintenanceDb.knex.transaction((trx) => timeoutFunctionAsyncJobs({ trx }));
        if (count > 0) {
            logger.info(`Timed out ${count} function async jobs`);
        }
    } finally {
        try {
            await locking.release(lock);
        } catch (err) {
            logger.error('Error releasing lock', { lock: lock.key, error: err });
        }
    }
}

export async function destroyTimeoutFunctionAsyncJobsCron(): Promise<void> {
    await maintenanceDb.destroy();
}
