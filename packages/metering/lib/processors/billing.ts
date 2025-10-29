import { billing } from '@nangohq/billing';
import { Subscriber } from '@nangohq/pubsub';
import { connectionService } from '@nangohq/shared';
import { Err, Ok, metrics, report, stringifyError } from '@nangohq/utils';

import { logger } from '../utils.js';

import type { Usage } from '@nangohq/account-usage';
import type { Transport, UsageEvent } from '@nangohq/pubsub';
import type { Result } from '@nangohq/utils';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class BillingProcessor {
    private subscriber: Subscriber;
    private usageTracker: Usage;

    constructor(transport: Transport, usageTracker: Usage) {
        this.subscriber = new Subscriber(transport);
        this.usageTracker = usageTracker;
    }

    public start(): void {
        logger.info('Starting billing subscriber...');

        this.subscriber.subscribe({
            consumerGroup: 'billing',
            subject: 'usage',
            callback: async (event) => {
                const result = await this.process(event);
                if (result.isErr()) {
                    report(new Error(`Failed to process billing event: ${result.error}`), { event });
                    return;
                }
            }
        });
    }

    public async process(event: UsageEvent): Promise<Result<void>> {
        try {
            switch (event.type) {
                case 'usage.monthly_active_records': {
                    const { connectionId } = event.payload.properties;
                    const connection = await connectionService.getConnectionById(connectionId);
                    if (!connection) {
                        return Err(`Connection ${connectionId} not found`);
                    }
                    if (connection.created_at > new Date(Date.now() - 30 * DAY_IN_MS)) {
                        return Ok(undefined); // Skip MAR for connections younger than 30 days
                    }
                    const mar = event.payload.value;
                    metrics.increment(metrics.Types.BILLED_RECORDS_COUNT, mar, { accountId: event.payload.properties.accountId });

                    return billing.add([
                        {
                            type: 'monthly_active_records',
                            properties: {
                                count: mar,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                ...event.payload.properties
                            }
                        }
                    ]);
                }
                case 'usage.records': {
                    const incrRecords = await this.usageTracker.incr({
                        accountId: event.payload.properties.accountId,
                        metric: 'records',
                        delta: event.payload.value
                    });
                    if (incrRecords.isErr()) {
                        logger.error(`Failed to increment records for account ${event.payload.properties.accountId}: ${incrRecords.error}`);
                    }
                    return Ok(undefined); // No billing action for records, just tracking usage
                }
                case 'usage.actions': {
                    return billing.add([
                        {
                            type: 'billable_actions',
                            properties: {
                                count: event.payload.value,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                ...event.payload.properties
                            }
                        }
                    ]);
                }
                case 'usage.connections': {
                    const accountId = event.payload.properties.accountId;
                    const value = event.payload.value;
                    await this.usageTracker.incr({
                        accountId,
                        metric: 'connections',
                        delta: value,
                        forceRevalidation: value < 0 // force revalidation when connections are being deleted
                    });

                    // also revalidate records usage metric immediately when connections are being deleted
                    if (value < 0) {
                        await this.usageTracker.revalidate({ accountId, metric: 'records' });
                    }

                    // No billing action for connections, just tracking usage
                    return Ok(undefined);
                }
                case 'usage.function_executions': {
                    const { accountId, type, telemetryBag, frequencyMs, success, ...rest } = event.payload.properties;
                    const compute = telemetryBag ? telemetryBag.durationMs * telemetryBag.memoryGb : 0;
                    const customLogs = telemetryBag?.customLogs ?? 0;

                    // Usage tracking
                    const incrExecutions = await this.usageTracker.incr({
                        accountId: event.payload.properties.accountId,
                        metric: 'function_executions',
                        delta: event.payload.value
                    });
                    if (incrExecutions.isErr()) {
                        logger.error(`Failed to increment function_executions for account ${event.payload.properties.accountId}: ${incrExecutions.error}`);
                    }
                    const incrCompute = await this.usageTracker.incr({
                        accountId: event.payload.properties.accountId,
                        metric: 'function_compute_gbms',
                        delta: compute
                    });
                    if (incrCompute.isErr()) {
                        logger.error(`Failed to increment function_compute_ms for account ${event.payload.properties.accountId}: ${incrCompute.error}`);
                    }
                    const incrLogs = await this.usageTracker.incr({
                        accountId: event.payload.properties.accountId,
                        metric: 'function_logs',
                        delta: customLogs
                    });
                    if (incrLogs.isErr()) {
                        logger.error(`Failed to increment logs for account ${event.payload.properties.accountId}: ${incrLogs.error}`);
                    }

                    // Billing
                    billing.add([
                        {
                            type: 'function_executions',
                            properties: {
                                accountId,
                                type,
                                count: event.payload.value,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                telemetry: {
                                    successes: success ? event.payload.value : 0,
                                    failures: success ? 0 : event.payload.value,
                                    durationMs: telemetryBag?.durationMs ?? 0,
                                    compute,
                                    customLogs,
                                    proxyCalls: telemetryBag?.proxyCalls ?? 0
                                },
                                ...rest,
                                ...(frequencyMs ? { frequencyMs } : {})
                            }
                        }
                    ]);

                    //Datadog
                    const durationMs = telemetryBag?.durationMs || 0;
                    // Bucket frequency into:
                    // - ultra (<5 mins)
                    // - fast (>=5 mins, <1h)
                    // - medium (>= 1h, <12h)
                    // - slow (>= 12h)
                    let frequencyBucket = 'none';
                    if (frequencyMs) {
                        if (frequencyMs < 5 * 60 * 1000) {
                            frequencyBucket = 'ultra';
                        } else if (frequencyMs < 60 * 60 * 1000) {
                            frequencyBucket = 'fast';
                        } else if (frequencyMs < 12 * 60 * 60 * 1000) {
                            frequencyBucket = 'medium';
                        } else {
                            frequencyBucket = 'slow';
                        }
                    }
                    metrics.duration(metrics.Types.FUNCTION_EXECUTIONS, durationMs, { type, success: String(success), accountId, frequencyBucket });
                    return Ok(undefined);
                }
                case 'usage.proxy': {
                    const { success, ...rest } = event.payload.properties;
                    // Usage tracking
                    await this.usageTracker.incr({
                        accountId: event.payload.properties.accountId,
                        metric: 'proxy',
                        delta: event.payload.value
                    });
                    // Billing
                    billing.add([
                        {
                            type: 'proxy',
                            properties: {
                                count: event.payload.value,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                ...rest,
                                telemetry: {
                                    successes: success ? event.payload.value : 0,
                                    failures: success ? 0 : event.payload.value
                                }
                            }
                        }
                    ]);
                    return Ok(undefined);
                }
                case 'usage.webhook_forward': {
                    const { success, ...rest } = event.payload.properties;
                    const incrWebhook = await this.usageTracker.incr({
                        accountId: event.payload.properties.accountId,
                        metric: 'webhook_forwards',
                        delta: event.payload.value
                    });
                    if (incrWebhook.isErr()) {
                        logger.error(`Failed to increment webhook_forwards for account ${event.payload.properties.accountId}: ${incrWebhook.error}`);
                    }
                    // Billing
                    billing.add([
                        {
                            type: 'webhook_forwards',
                            properties: {
                                count: event.payload.value,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                ...rest,
                                telemetry: {
                                    successes: success ? event.payload.value : 0,
                                    failures: success ? 0 : event.payload.value
                                }
                            }
                        }
                    ]);
                    return Ok(undefined);
                }
                default:
                    ((_exhaustiveCheck: never) => {
                        throw new Error(`Unhandled event type: ${JSON.stringify(_exhaustiveCheck)}`);
                    })(event);
            }
        } catch (err) {
            return Err(`Error processing billing event: ${stringifyError(err)}`);
        }
    }
}
