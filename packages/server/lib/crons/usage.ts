import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { getLogger, metrics, report, flagHasUsage } from '@nangohq/utils';
import { billing as usageBilling } from '@nangohq/billing';

import { envs } from '../env.js';

const logger = getLogger('cron.exportUsage');
const cronMinutes = envs.CRON_EXPORT_USAGE_MINUTES;

export function exportUsageCron(): void {
    if (!flagHasUsage || cronMinutes <= 0) {
        logger.info(`Skipping (flagHasUsage=${flagHasUsage}, cronMinutes=${cronMinutes})`);
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
    await tracer.trace<Promise<void>>('nango.cron.exportUsage', async () => {
        logger.info(`Starting`);
        await billing.exportBillableConnections();
        await observability.exportConnectionsMetrics();
        await observability.exportRecordsMetrics();
        logger.info(`✅ done`);
    });
}

const observability = {
    exportConnectionsMetrics: async (): Promise<void> => {
        await tracer.trace<Promise<void>>('nango.cron.exportUsage.observability.connections', async (span) => {
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
    },
    exportRecordsMetrics: async (): Promise<void> => {
        await tracer.trace<Promise<void>>('nango.cron.exportUsage.observability.records', async (span) => {
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
};

const billing = {
    exportBillableConnections: async (): Promise<void> => {
        await tracer.trace<Promise<void>>('nango.cron.exportUsage.billing.connections', async (span) => {
            try {
                const now = new Date();
                const res = await connectionService.billableConnections(now);
                if (res.isErr()) {
                    throw res.error;
                }
                const events = res.value.map(({ accountId, count }) => {
                    return { type: 'billable_connections' as const, value: count, properties: { accountId, timestamp: now } };
                });
                await usageBilling.sendAll(events);
            } catch (err) {
                span.setTag('error', err);
                report(new Error('cron_failed_to_export_billable_connections', { cause: err }));
            }
        });
    }
};
