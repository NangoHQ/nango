import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { billing as usageBilling } from '@nangohq/billing';
import { getLocking } from '@nangohq/kvstore';
import { records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { flagHasUsage, getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Lock } from '@nangohq/kvstore';
import type { RecordsBillingEvent } from '@nangohq/types';

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
        const ttlMs = cronMinutes * 60 * 1000 * 0.8; // slightly less than the cron interval to avoid overlap
        let lock: Lock | undefined;
        const lockKey = `lock:cron:exportUsage`;

        try {
            lock = await locking.acquire(lockKey, ttlMs);
        } catch {
            logger.info(`Could not acquire lock, skipping`);
            return;
        }

        try {
            // TODO: get rid of billing exports which are legacy events
            await billing.exportBillableConnections();
            await observability.exportConnectionsMetrics();
            await observability.exportRecordsMetrics();
            logger.info(`✅ done`);
        } catch (err) {
            logger.error('Failed to export usage metrics', err);
            if (lock) {
                await locking.release(lock);
            }
            // only releasing the lock on error
            // and letting it expires otherwise so no other execution can occur until the next cron
        }
    });
}

const observability = {
    exportConnectionsMetrics: async (): Promise<void> => {
        await tracer.trace<Promise<void>>('nango.cron.exportUsage.observability.connections', async (span) => {
            try {
                const counts = await connectionService.countMetric();
                if (counts.isErr()) {
                    throw counts.error;
                }
                for (const { accountId, count } of counts.value) {
                    usageBilling.add([
                        {
                            type: 'billable_connections_v2' as const,
                            properties: {
                                accountId,
                                count,
                                timestamp: new Date(),
                                frequencyMs: cronMinutes * 60 * 1000
                            }
                        }
                    ]);
                    metrics.gauge(metrics.Types.CONNECTIONS_COUNT, count, { accountId });
                }
            } catch (err) {
                span.setTag('error', err);
                logger.error('Failed to export connections metrics', err);
            }
        });
    },
    exportRecordsMetrics: async (): Promise<void> => {
        await tracer.trace<Promise<void>>('nango.cron.exportUsage.observability.records', async (span) => {
            try {
                const now = new Date();
                const aggMetrics = new Map<number, RecordsBillingEvent>();
                // records metrics are per environment, so we fetch the record counts first and then we need to:
                // - get the account ids
                // - aggregate per account
                //
                // Performance note: This nested pagination approach is necessary because records and connections
                // are stored in separate databases, making SQL JOINs impossible.
                // To reconsider when record counts table becomes very large
                for await (const recordCounts of records.paginateRecordCounts()) {
                    if (recordCounts.isErr()) {
                        throw recordCounts.error;
                    }
                    if (recordCounts.value.length === 0) {
                        continue;
                    }

                    const connectionIds = recordCounts.value.map((r) => r.connection_id);
                    for await (const res of connectionService.paginateConnections({ connectionIds })) {
                        if (res.isErr()) {
                            throw res.error;
                        }
                        for (const entry of res.value) {
                            // sum records data for this connection. There might be multiple models or variants for the same connection
                            const sum = recordCounts.value
                                .filter((r) => r.connection_id === entry.connection.id)
                                .reduce(
                                    (acc, curr) => {
                                        acc.count += curr.count;
                                        acc.size_bytes += Number(curr.size_bytes);
                                        return acc;
                                    },
                                    { count: 0, size_bytes: 0 }
                                );
                            if (sum.count > 0) {
                                // aggregate
                                const key = entry.account.id;
                                const existingAgg = aggMetrics.get(key);
                                if (existingAgg) {
                                    existingAgg.properties.count += sum.count;
                                    existingAgg.properties.telemetry.sizeBytes += sum.size_bytes;
                                } else {
                                    aggMetrics.set(key, {
                                        type: 'records' as const,
                                        properties: {
                                            count: sum.count,
                                            accountId: entry.account.id,
                                            timestamp: now,
                                            frequencyMs: cronMinutes * 60 * 1000,
                                            telemetry: { sizeBytes: sum.size_bytes }
                                        }
                                    });
                                }
                            }
                        }
                    }
                }

                // ingest into billing
                const toBilling = usageBilling.add(Array.from(aggMetrics.values()));
                if (toBilling.isErr()) {
                    logger.error(`Failed to ingest record billing events`);
                }

                // send to datadog
                for (const {
                    properties: {
                        count,
                        accountId,
                        telemetry: { sizeBytes }
                    }
                } of aggMetrics.values()) {
                    metrics.gauge(metrics.Types.RECORDS_TOTAL_COUNT, count, { accountId });
                    metrics.gauge(metrics.Types.RECORDS_TOTAL_SIZE_IN_BYTES, sizeBytes, { accountId });
                }
            } catch (err) {
                span.setTag('error', err);
                logger.error('Failed to export records metrics', err);
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
                    return {
                        type: 'billable_connections' as const,
                        properties: {
                            count,
                            accountId,
                            timestamp: now
                        }
                    };
                });

                const sendRes = usageBilling.add(events);
                if (sendRes.isErr()) {
                    throw sendRes.error;
                }
            } catch (err) {
                span.setTag('error', err);
                logger.error('Failed to export billable connections', err);
            }
        });
    }
};
