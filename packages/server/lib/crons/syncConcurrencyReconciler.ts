import tracer from 'dd-trace';
import * as cron from 'node-cron';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { getSyncConcurrencyOverrides } from '@nangohq/shared';
import { flagHasPlan, getLogger, metrics, report } from '@nangohq/utils';

import { getOrchestrator } from '../utils/utils.js';

import type { Lock } from '@nangohq/kvstore';

const cronMinutes = 5;

const logger = getLogger('cron.syncConcurrencyReconciler');

export function syncConcurrencyReconcilerCron(): void {
    if (!flagHasPlan) {
        return;
    }

    cron.schedule(
        `*/${cronMinutes} * * * *`,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            const start = Date.now();
            try {
                await tracer.trace<Promise<void>>('nango.cron.syncConcurrencyReconciler', async () => {
                    await exec();
                });
            } catch (err) {
                report(new Error('cron_failed_to_reconcile_sync_concurrency', { cause: err }));
            }
            metrics.duration(metrics.Types.CRON_SYNC_CONCURRENCY_RECONCILER, Date.now() - start);
        }
    );
}

export async function exec(): Promise<void> {
    const locking = await getLocking();
    const lockKey = `lock:syncConcurrencyReconciler:cron`;
    let lock: Lock | undefined;
    try {
        try {
            lock = await locking.acquire(lockKey, cronMinutes * 60 * 1000);
        } catch {
            logger.info(`Could not acquire lock, skipping`);
            return;
        }

        const overrides = await getSyncConcurrencyOverrides(db.knex);
        if (overrides.isErr()) {
            report(new Error('failed_to_get_sync_concurrency_overrides', { cause: overrides.error }));
            return;
        }

        const res = await getOrchestrator().reconcileSyncConcurrency(overrides.value);
        if (res.isErr()) {
            report(new Error('failed_to_reconcile_sync_concurrency', { cause: res.error }));
            return;
        }

        if (res.value.updated > 0) {
            logger.info(`Reconciled sync concurrency`, { overrides: overrides.value.length, updated: res.value.updated });
        }
    } finally {
        if (lock) {
            try {
                await locking.release(lock);
            } catch (err) {
                logger.error('Error releasing lock', { lock: lock.key, error: err });
            }
        }
    }
}
