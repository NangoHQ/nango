import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
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
            const countRes = await records.countMetric();
            if (countRes.isErr()) {
                throw countRes.error;
            }
            metrics.gauge(metrics.Types.RECORDS_TOTAL_COUNT, Number(countRes.value.count));
        } catch (err) {
            span.setTag('error', err);
            report(new Error('cron_failed_to_export_records_metrics', { cause: err }));
        }
    });
}
