import { getAccountUsageTracker, onUsageIncreased } from '@nangohq/account-usage';
import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { Subscriber } from '@nangohq/pubsub';
import { connectionService, getPlan } from '@nangohq/shared';
import { Err, Ok, metrics, report, stringifyError } from '@nangohq/utils';

import { logger } from '../utils.js';

import type { Transport, UsageEvent } from '@nangohq/pubsub';
import type { AccountUsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class BillingProcessor {
    private subscriber: Subscriber;

    constructor(transport: Transport) {
        this.subscriber = new Subscriber(transport);
    }

    public start(): void {
        logger.info('Starting billing subscriber...');

        this.subscriber.subscribe({
            consumerGroup: 'billing',
            subject: 'usage',
            callback: async (event) => {
                logger.info(`Processing billing event`, { event });
                const result = await process(event);
                if (result.isErr()) {
                    report(new Error(`Failed to process billing event: ${result.error}`), { event });
                    return;
                }
            }
        });
    }
}

async function process(event: UsageEvent): Promise<Result<void>> {
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
                await trackUsage({
                    accountId: event.payload.properties.accountId,
                    metric: 'active_records',
                    delta: mar
                });

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
            case 'usage.actions': {
                await trackUsage({
                    accountId: event.payload.properties.accountId,
                    metric: 'actions',
                    delta: event.payload.value
                });
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
                await trackUsage({
                    accountId: event.payload.properties.accountId,
                    metric: 'connections',
                    delta: event.payload.value
                });
                // No billing action for connections, just tracking usage
                return Ok(undefined);
            }
            case 'usage.function_executions': {
                const { telemetryBag, frequencyMs, success, ...rest } = event.payload.properties;
                billing.add([
                    {
                        type: 'function_executions',
                        properties: {
                            count: event.payload.value,
                            idempotencyKey: event.idempotencyKey,
                            timestamp: event.createdAt,
                            telemetry: {
                                successes: success ? event.payload.value : 0,
                                failures: success ? 0 : event.payload.value,
                                durationMs: telemetryBag?.durationMs ?? 0,
                                memoryGb: telemetryBag?.memoryGb ?? 0,
                                customLogs: telemetryBag?.customLogs ?? 0,
                                proxyCalls: telemetryBag?.proxyCalls ?? 0
                            },
                            ...rest,
                            ...(frequencyMs ? { frequencyMs } : {})
                        }
                    }
                ]);
                return Ok(undefined);
            }
            case 'usage.proxy': {
                const { success, ...rest } = event.payload.properties;
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

async function trackUsage({ accountId, metric, delta }: { accountId: number; metric: AccountUsageMetric; delta: number }): Promise<void> {
    try {
        if (metric !== 'connections') {
            const accountUsageTracker = await getAccountUsageTracker();
            await accountUsageTracker.incrementUsage({
                accountId,
                metric,
                delta
            });
        }

        const plan = await getPlan(db.knex, { accountId });
        if (plan.isErr()) {
            throw new Error(`Failed to get plan for account ${accountId}: ${plan.error.message}}`);
        }
        await onUsageIncreased({
            accountId,
            metric,
            delta,
            plan: plan.value
        });
    } catch (err) {
        report(new Error('Failed to track usage', { cause: err }), { accountId, metric, delta });
    }
}
