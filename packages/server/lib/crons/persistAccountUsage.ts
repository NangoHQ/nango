/**
 * Persist monthly account usage data from redis to the database.
 * This usage is used for capping, not for billing.
 */

import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { DbAccountUsageStore } from '@nangohq/account-usage';
import { getKVStore } from '@nangohq/kvstore';
import { envs } from '@nangohq/logs';
import { flagHasPlan, getLogger, metrics, report } from '@nangohq/utils';

import type { UsageMetric } from '@nangohq/account-usage';

const cronMinutes = envs.CRON_PERSIST_ACCOUNT_USAGE_MINUTES;
const logger = getLogger('cron.persistAccountUsage');

export function persistAccountUsageCron(): void {
    if (!flagHasPlan) {
        return;
    }

    cron.schedule(
        `*/${cronMinutes} * * * *`,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            const start = Date.now();
            try {
                await tracer.trace<Promise<void>>('nango.server.cron.persistAccountUsage', async () => {
                    await exec();
                });

                logger.info('✅ done');
            } catch (err) {
                report(new Error('cron_failed_to_persist_account_usage', { cause: err }));
            }
            metrics.duration(metrics.Types.CRON_PERSIST_ACCOUNT_USAGE, Date.now() - start);
        }
    );
}

async function exec(): Promise<void> {
    logger.info(`Starting`);

    const kvStore = await getKVStore();
    const dbStore = new DbAccountUsageStore();

    const summary = {
        persisted: 0,
        deleted: 0,
        skipped: 0
    };

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    for await (const key of kvStore.scan('usage:*')) {
        const [, accountId, metric, yearMonth] = key.split(':');
        if (!accountId || !metric || !yearMonth) {
            logger.error(`Invalid key: ${key}`);
            summary.skipped++;
            continue;
        }

        const [year, month] = yearMonth.split('-');
        const monthDate = new Date(Number(year), Number(month) - 1, 1);

        const usage = await kvStore.get(key);
        if (!usage) {
            logger.error(`Usage not found for key: ${key}`);
            summary.skipped++;
            continue;
        }

        logger.info(`Persisting ${metric} usage for accountId: ${accountId} (${yearMonth})`);
        await dbStore.setUsage({ accountId: Number(accountId), metric: metric as UsageMetric, value: Number(usage), month: monthDate });
        summary.persisted++;

        // Delete keys from past months since they shouldn't change anymore. Makes this cron faster.
        if (monthDate.getTime() < startOfMonth.getTime()) {
            logger.info(`Cleaning up kvStore key from past month: ${key}`);
            await kvStore.delete(key);
            summary.deleted++;
        }
    }

    logger.info(`✅ done (Persisted: ${summary.persisted}, Deleted keys: ${summary.deleted}, Skipped: ${summary.skipped})`);
}
