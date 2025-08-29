import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { billing as usageBilling } from '@nangohq/billing';
import { getLocking } from '@nangohq/kvstore';
import { records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { flagHasUsage, getLogger, metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Lock } from '@nangohq/kvstore';
import type { BillingMetric } from '@nangohq/types';

const logger = getLogger('cron.exportUsage');
const cronMinutes = envs.CRON_EXPORT_USAGE_MINUTES;

export function exportUsageCron(): void {
    if (!flagHasUsage || cronMinutes <= 0) {
        logger.info(`Skipping (flagHasUsage=${flagHasUsage}, cronMinutes=${cronMinutes})`);
        return;
    }

    cron.schedule(`*/${cronMinutes} * * * *`, () => {
        (async () => {
            await exec();
        })();
    });
}

export async function exec(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.exportUsage', async () => {
        logger.info(`Starting`);

        const locking = await getLocking();
        const ttlMs = cronMinutes * 60 * 1000;
        let lock: Lock | undefined;
        const lockKey = `lock:cron:exportUsage`;

        try {
            lock = await locking.acquire(lockKey, ttlMs);
        } catch {
            logger.info(`Could not acquire lock, skipping`);
            return;
        }

        try {
            await billing.exportBillableConnections();
            await billing.exportActiveConnections();
            await observability.exportConnectionsMetrics();
            await observability.exportRecordsMetrics();
            logger.info(`✅ done`);
        } finally {
            if (lock) {
                await locking.release(lock);
            }
        }
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

                const events = res.value.map<BillingMetric>(({ accountId, count }) => {
                    return { type: 'billable_connections', value: count, properties: { accountId, timestamp: now } };
                });

                const sendRes = usageBilling.addAll(events);
                if (sendRes.isErr()) {
                    throw sendRes.error;
                }
            } catch (err) {
                span.setTag('error', err);
                report(new Error('cron_failed_to_export_billable_connections', { cause: err }));
            }
        });
    },
    exportActiveConnections: async (): Promise<void> => {
        await tracer.trace<Promise<void>>('nango.cron.exportUsage.billing.active.connections', async (span) => {
            try {
                const now = new Date();
                const res = await connectionService.billableActiveConnections(now);
                if (res.isErr()) {
                    throw res.error;
                }

                const events = res.value.map<BillingMetric>(({ accountId, count }) => {
                    return { type: 'billable_active_connections', value: count, properties: { accountId, timestamp: now } };
                });

                const sendRes = usageBilling.addAll(events);
                if (sendRes.isErr()) {
                    throw sendRes.error;
                }
            } catch (err) {
                span.setTag('error', err);
                report(new Error('cron_failed_to_export_billable_active_connections', { cause: err }));
            }
        });
    }
};
