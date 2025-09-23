import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { billing as usageBilling } from '@nangohq/billing';
import { getLocking } from '@nangohq/kvstore';
import { records } from '@nangohq/records';
import { connectionService, environmentService } from '@nangohq/shared';
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
                    metrics.gauge(metrics.Types.CONNECTIONS_COUNT, count, { accountId });
                    metrics.gauge(metrics.Types.CONNECTIONS_WITH_ACTIONS_COUNT, withActions);
                    metrics.gauge(metrics.Types.CONNECTIONS_WITH_SYNCS_COUNT, withSyncs);
                    metrics.gauge(metrics.Types.CONNECTIONS_WITH_WEBHOOKS_COUNT, withWebhooks);
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
                const res = await records.metrics();
                if (res.isErr()) {
                    throw res.error;
                }

                // Group by account
                const envIds = res.value.map((r) => r.environmentId);
                const envs = await environmentService.getEnvironmentsByIds(envIds);
                const metricsByAccount = new Map<number, { count: number; sizeInBytes: number }>();
                for (const env of envs) {
                    const metrics = res.value.find((r) => r.environmentId === env.id);
                    if (!metrics) {
                        continue;
                    }
                    const existing = metricsByAccount.get(env.account_id);
                    if (existing) {
                        existing.count += metrics.count;
                        existing.sizeInBytes += metrics.sizeInBytes;
                    } else {
                        metricsByAccount.set(env.account_id, { count: metrics.count, sizeInBytes: metrics.sizeInBytes });
                    }
                }

                for (const [accountId, { count, sizeInBytes: sizeBytes }] of metricsByAccount.entries()) {
                    metrics.gauge(metrics.Types.RECORDS_TOTAL_COUNT, count, { accountId });
                    metrics.gauge(metrics.Types.RECORDS_TOTAL_SIZE_IN_BYTES, sizeBytes, { accountId });
                }
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
