import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { records } from '@nangohq/records';
import { connectionService, environmentService } from '@nangohq/shared';
import { getLogger, metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';

const logger = getLogger('cron.exportUsageMetrics');
const cronMinutes = envs.CRON_EXPORT_USAGE_METRICS_MINUTES;

export function exportUsageMetricsCron(): void {
    // set env var CRON_EXPORT_USAGE_METRICS_MINUTES to 0 to disable
    if (cronMinutes <= 0) {
        return;
    }
    // add some jitter to avoid all instances running at the same time
    const jitter = Math.floor(Math.random() * cronMinutes);
    cron.schedule(`*/${cronMinutes + jitter} * * * *`, () => {
        (async () => {
            await exec();
        })();
    });
}

export async function exec(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.exportUsageMetrics', async () => {
        logger.info(`Starting`);
        await exportConnectionsMetrics();
        await exportRecordsMetrics();
        logger.info(`✅ done`);
    });
}

async function exportConnectionsMetrics(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.exportUsageMetrics.connections', async (span) => {
        try {
            const connRes = await connectionService.countMetric();
            if (connRes.isErr()) {
                throw connRes.error;
            }
            for (const { accountId, count, withActions, withSyncs, withWebhooks } of connRes.value) {
                metrics.gauge(metrics.Types.CONNECTIONS_COUNT, count, { accountId: accountId });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_ACTIONS_COUNT, withActions, { accountId });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_SYNCS_COUNT, withSyncs, { accountId });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_WEBHOOKS_COUNT, withWebhooks, { accountId });
            }
        } catch (err) {
            span.setTag('error', err);
            report(new Error('cron_failed_to_export_connections_metrics', { cause: err }));
        }
    });
}

async function exportRecordsMetrics(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.exportUsageMetrics.records', async (span) => {
        try {
            // Records count
            // Records db doesn't store account so we first get records count per environment
            // and then we aggregate environments per account
            const recordsRes = await records.countMetric();
            if (recordsRes.isErr()) {
                throw recordsRes.error;
            }
            const envs = await environmentService.getAll();
            if (envs.length <= 0) {
                throw new Error('no_environments');
            }
            const countByAccount = recordsRes.value.reduce((acc, { environmentId, count }) => {
                const env = envs.find((e) => e.environmentId === environmentId);
                if (!env) {
                    return acc;
                }
                const prev = acc.get(env.accountId) || 0;
                acc.set(env.accountId, prev + Number(count));
                return acc;
            }, new Map<number, number>());

            for (const [accountId, count] of countByAccount) {
                metrics.gauge(metrics.Types.RECORDS_TOTAL_COUNT, count, { accountId });
            }
        } catch (err) {
            span.setTag('error', err);
            report(new Error('cron_failed_to_export_records_metrics', { cause: err }));
        }
    });
}
