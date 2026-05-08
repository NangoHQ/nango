import tracer from 'dd-trace';
import * as cron from 'node-cron';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { pubsub } from '@nangohq/shared';
import { getLogger, metrics, report, useLambdaKeepWarm } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Lock } from '@nangohq/kvstore';
import type { DBEnvironment } from '@nangohq/types';

const logger = getLogger('cron.lambdaKeepWarm');

const lambdaKeepWarmAccountAgeMs = envs.LAMBDA_KEEP_WARM_ACCOUNT_AGE_MS;
const cronMinutes = envs.CRON_LAMBDA_KEEP_WARM_EVERY_MINUTES;

export function lambdaKeepWarmCron(): void {
    if (!useLambdaKeepWarm) {
        logger.info('Lambda keep-warm cron skipped - lambda keep-warm not enabled');
        return;
    }
    if (cronMinutes <= 0) {
        logger.info('Lambda keep-warm cron skipped - cron minutes not set');
        return;
    }

    cron.schedule(`*/${cronMinutes} * * * *`, () => {
        (async () => {
            const start = Date.now();
            try {
                await exec();
            } catch (err) {
                report(new Error('cron_failed_lambda_keep_warm', { cause: err }));
            } finally {
                metrics.duration(metrics.Types.CRON_LAMBDA_KEEP_WARM, Date.now() - start);
                logger.info('✅ done');
            }
        })().catch((err: unknown) => {
            logger.error('Failed to execute lambdaKeepWarm cron job');
            report(new Error('cron_failed_lambda_keep_warm', { cause: err }));
        });
    });
}

export async function exec(): Promise<void> {
    const locking = await getLocking();

    await tracer.trace<Promise<void>>('nango.server.cron.lambdaKeepWarm', async (span) => {
        let lock: Lock | undefined;
        try {
            logger.info('Starting');

            const ttlMs = cronMinutes * 60 * 1000;
            const lockKey = 'lock:lambdaKeepWarm:cron';

            try {
                lock = await locking.acquire(lockKey, ttlMs);
            } catch {
                logger.info('Could not acquire lock, skipping');
                return;
            }

            const since = new Date(Date.now() - lambdaKeepWarmAccountAgeMs);

            const rows = await db.readOnly
                .select<{ account_id: number; id: number }[]>('_nango_environments.account_id', '_nango_environments.id')
                .from<DBEnvironment>('_nango_environments')
                .join('plans', 'plans.account_id', '_nango_environments.account_id')
                .where('_nango_environments.deleted', false)
                .where('_nango_environments.created_at', '>=', since)
                .where('plans.lambda_tenant_isolation', true);

            for (const row of rows) {
                const res = await pubsub.publisher.publish({
                    subject: 'lambda_keep_warm',
                    type: 'lambda_keep_warm.invoke',
                    payload: {
                        accountId: row.account_id,
                        environmentId: row.id,
                        provisionedConcurrency: 1
                    }
                });
                if (res.isErr()) {
                    report(new Error('lambda_keep_warm_publish_failed', { cause: res.error }), {
                        accountId: row.account_id,
                        environmentId: row.id
                    });
                }
            }
        } catch (err) {
            report(new Error('cron_failed_lambda_keep_warm', { cause: err }));
            span.setTag('error', err);
        } finally {
            if (lock) {
                locking.release(lock);
            }
        }
    });
}
