import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { getLocking } from '@nangohq/kvstore';
import { getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Lock } from '@nangohq/kvstore';

const logger = getLogger('cron.billingEventsS3DLQMonitor');
const cronMinute = envs.CRON_BILLING_EVENTS_S3_DLQ_MONITOR_MINUTE;
const bucket = envs.BILLING_EVENTS_S3_DLQ_BUCKET;
const region = envs.BILLING_EVENTS_S3_REGION;

const LOCK_KEY = 'lock:cron:billingEventsS3DLQMonitor';
// Cron fires hourly; lock should expire well before the next tick.
const lockTtlMs = 30 * 60 * 1000;

const s3 = new S3Client({ region });

export function billingEventsS3DLQMonitorCron(): void {
    if (cronMinute < 0) {
        logger.info(`Skipping (CRON_BILLING_EVENTS_S3_DLQ_MONITOR_MINUTE=${cronMinute})`);
        return;
    }
    if (!bucket) {
        logger.warning(`Skipping (BILLING_EVENTS_S3_DLQ_BUCKET not set)`);
        return;
    }
    cron.schedule(`${cronMinute} * * * *`, () => {
        exec().catch((err: unknown) => {
            logger.error('Cron tick failed unexpectedly', err);
        });
    });
}

export async function exec(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.billingEventsS3DLQMonitor', async () => {
        logger.info(`Starting`);
        await withLock(async () => {
            let success = false;
            try {
                const fileCount = await countObjects();
                metrics.gauge(metrics.Types.BILLING_EVENTS_S3_DLQ_FILES, fileCount);
                if (fileCount > 0) {
                    logger.warning(`DLQ bucket s3://${bucket!} has ${fileCount} file(s); alert should fire.`);
                } else {
                    logger.info(`DLQ bucket s3://${bucket!} is empty.`);
                }
                success = true;
            } catch (err) {
                logger.error(`Failed to inspect DLQ bucket s3://${bucket!}`, err);
                // Re-throw so dd-trace tags the enclosing span as errored — without this, the
                // span looks clean in APM even though the run failed. The `finally` below still
                // emits success:false before the rejection propagates.
                throw err;
            } finally {
                metrics.increment(metrics.Types.BILLING_EVENTS_S3_DLQ_MONITOR_RUN_RESULT, 1, { success: success ? 'true' : 'false' });
            }
        });
    });
}

// We're already broken past 100 files; no need to paginate further.
const MAX_FILES_TO_COUNT = 100;

async function countObjects(): Promise<number> {
    let count = 0;
    let continuationToken: string | undefined;
    do {
        const res = await s3.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                ContinuationToken: continuationToken
            })
        );
        count += res.KeyCount ?? 0;
        if (count >= MAX_FILES_TO_COUNT) return MAX_FILES_TO_COUNT;
        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
    return count;
}

async function withLock(fn: () => Promise<void>): Promise<void> {
    const locking = await getLocking();
    let lock: Lock;
    try {
        lock = await locking.acquire(LOCK_KEY, lockTtlMs);
    } catch {
        logger.info(`Could not acquire lock, skipping`);
        return;
    }
    logger.info(`Lock acquired`);
    try {
        await fn();
    } finally {
        try {
            await locking.release(lock);
        } catch (err) {
            logger.error('Error releasing lock', { lock: lock.key, error: err });
        }
    }
}
