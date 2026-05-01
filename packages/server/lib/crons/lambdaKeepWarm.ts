import tracer from 'dd-trace';
import * as cron from 'node-cron';

import db from '@nangohq/database';
import { pubsub } from '@nangohq/shared';
import { getLogger, metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';

import type { DBEnvironment } from '@nangohq/types';

const logger = getLogger('cron.lambdaKeepWarm');

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

export function lambdaKeepWarmCron(): void {
    if (!envs.LAMBDA_ENABLED) {
        return;
    }
    const cronMinutes = envs.CRON_LAMBDA_KEEP_WARM_EVERY_MINUTES;
    if (cronMinutes <= 0) {
        return;
    }

    cron.schedule(
        `*/${cronMinutes} * * * *`,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            const start = Date.now();
            try {
                await tracer.trace<Promise<void>>('nango.server.cron.lambdaKeepWarm', async () => {
                    await exec();
                });
                logger.info('✅ done');
            } catch (err) {
                report(new Error('cron_failed_lambda_keep_warm', { cause: err }));
            }
            metrics.duration(metrics.Types.CRON_LAMBDA_KEEP_WARM, Date.now() - start);
        }
    );
}

export async function exec(): Promise<void> {
    const since = new Date(Date.now() - TWENTY_FOUR_H_MS);

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
}
