import tracer from 'dd-trace';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { Subscriber } from '@nangohq/pubsub';
import { connectionService } from '@nangohq/shared';
import { Err, Ok, metrics, report, stringifyError } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../utils.js';

import type { Transport } from '@nangohq/pubsub';
import type { UsageEvent } from '@nangohq/types';
import type { Clickhouse, Usage } from '@nangohq/usage';
import type { Result } from '@nangohq/utils';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class UsageProcessor {
    private subscriber: Subscriber;
    private usageTracker: Usage;
    private clickhouse: Clickhouse;

    constructor({ transport, usageTracker, clickhouse }: { transport: Transport; usageTracker: Usage; clickhouse: Clickhouse }) {
        this.subscriber = new Subscriber(transport);
        this.usageTracker = usageTracker;
        this.clickhouse = clickhouse;
    }

    public start(): void {
        logger.info('Starting usage subscriber...', { concurrency: envs.METERING_USAGE_EVENTS_SUBSCRIBE_CONCURRENCY });

        this.subscriber.subscribe({
            consumerGroup: 'billing', // Legacy name for backward compatibility and avoid processing duplication
            subject: 'usage',
            concurrency: envs.METERING_USAGE_EVENTS_SUBSCRIBE_CONCURRENCY,
            callback: async (event) => {
                const result = await this.process(event);
                if (result.isErr()) {
                    report(new Error(`Failed to process usage event: ${result.error}`), { event });
                    return;
                }
            }
        });
    }

    private logIncrError(metric: string, accountId: number, result: Result<unknown>): void {
        if (result.isErr()) {
            logger.error(`Failed to increment ${metric} for account ${accountId}: ${stringifyError(result.error, { cause: true })}`);
        }
    }

    public async process(event: UsageEvent): Promise<Result<void>> {
        return tracer.trace<Promise<Result<void>>>('nango.metering.usage.process', async (span) => {
            span.setTag('event_type', event.type);
            const result = await this._process(event);
            if (result.isErr()) {
                span.setTag('error', result.error);
            }
            return result;
        });
    }

    private async _process(event: UsageEvent): Promise<Result<void>> {
        try {
            switch (event.type) {
                case 'usage.monthly_active_records': {
                    const { connectionId, environmentId, environmentName, integrationId, accountId, syncId, model } = event.payload.properties;
                    const connection = await connectionService.checkIfConnectionExists(db.knex, {
                        connectionId,
                        providerConfigKey: integrationId,
                        environmentId
                    });
                    if (!connection) {
                        return Err(`Connection ${connectionId} not found`);
                    }
                    if (connection.created_at > new Date(Date.now() - 30 * DAY_IN_MS)) {
                        return Ok(undefined); // Skip MAR for connections younger than 30 days
                    }
                    const mar = event.payload.value;
                    metrics.increment(metrics.Types.BILLED_RECORDS_COUNT, mar, { accountId });

                    this.clickhouse.add([event]);

                    return billing.add([
                        {
                            type: 'monthly_active_records',
                            properties: {
                                count: mar,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                accountId,
                                environmentId,
                                environmentName,
                                integrationId,
                                syncId,
                                model
                            }
                        }
                    ]);
                }
                case 'usage.records': {
                    const { accountId } = event.payload.properties;
                    const incrRecords = await this.usageTracker.incr({
                        accountId,
                        metric: 'records',
                        delta: event.payload.value
                    });
                    this.logIncrError('records', accountId, incrRecords);
                    return Ok(undefined); // No billing action for records, just tracking usage
                }
                case 'usage.actions': {
                    const { accountId, environmentId, environmentName, integrationId, actionName } = event.payload.properties;

                    this.clickhouse.add([event]);

                    return billing.add([
                        {
                            type: 'billable_actions',
                            properties: {
                                count: event.payload.value,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                accountId,
                                environmentId,
                                environmentName,
                                integrationId,
                                actionName
                            }
                        }
                    ]);
                }
                case 'usage.connections': {
                    const { accountId } = event.payload.properties;
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
                    const {
                        accountId,
                        environmentId,
                        environmentName,
                        integrationId,
                        functionName,
                        type,
                        telemetryBag,
                        frequencyMs,
                        success,
                        runtime = 'runner'
                    } = event.payload.properties;
                    const compute = telemetryBag ? telemetryBag.durationMs * telemetryBag.memoryGb : 0;
                    const customLogs = telemetryBag?.customLogs ?? 0;

                    // Usage tracking
                    const incrExecutions = await this.usageTracker.incr({
                        accountId,
                        metric: 'function_executions',
                        delta: event.payload.value
                    });
                    this.logIncrError('function_executions', accountId, incrExecutions);
                    const incrCompute = await this.usageTracker.incr({
                        accountId: accountId,
                        metric: 'function_compute_gbms',
                        delta: compute > 0 ? Math.max(1, Math.round(compute)) : 0 // HINCRBY needs an integer; floor non-zero compute at 1 so small values aren't dropped
                    });
                    this.logIncrError('function_compute_gbms', accountId, incrCompute);
                    const incrLogs = await this.usageTracker.incr({
                        accountId: accountId,
                        metric: 'function_logs',
                        delta: customLogs
                    });
                    this.logIncrError('function_logs', accountId, incrLogs);

                    // Clickhouse
                    this.clickhouse.add([event]);

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
                                environmentId,
                                environmentName,
                                integrationId,
                                functionName,
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
                    metrics.duration(metrics.Types.FUNCTION_EXECUTIONS, durationMs, {
                        type,
                        success: String(success),
                        accountId,
                        frequencyBucket,
                        functionRuntime: runtime
                    });
                    return Ok(undefined);
                }
                case 'usage.proxy': {
                    const { accountId, environmentId, environmentName, integrationId, success } = event.payload.properties;
                    // Usage tracking
                    await this.usageTracker.incr({
                        accountId,
                        metric: 'proxy',
                        delta: event.payload.value
                    });
                    // Clickhouse
                    this.clickhouse.add([event]);
                    // Billing
                    billing.add([
                        {
                            type: 'proxy',
                            properties: {
                                count: event.payload.value,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                accountId,
                                environmentId,
                                environmentName,
                                integrationId,
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
                    const { accountId, environmentId, environmentName, integrationId, success } = event.payload.properties;
                    const incrWebhook = await this.usageTracker.incr({
                        accountId,
                        metric: 'webhook_forwards',
                        delta: event.payload.value
                    });
                    this.logIncrError('webhook_forwards', accountId, incrWebhook);
                    // Clickhouse
                    this.clickhouse.add([event]);
                    // Billing
                    billing.add([
                        {
                            type: 'webhook_forwards',
                            properties: {
                                count: event.payload.value,
                                idempotencyKey: event.idempotencyKey,
                                timestamp: event.createdAt,
                                accountId,
                                environmentId,
                                environmentName,
                                integrationId,
                                telemetry: {
                                    successes: success ? event.payload.value : 0,
                                    failures: success ? 0 : event.payload.value
                                }
                            }
                        }
                    ]);
                    return Ok(undefined);
                }
                case 'usage.data_transfer': {
                    const { package: pkg, callsite, ingressedBytes, egressedBytes } = event.payload.properties;
                    metrics.increment(metrics.Types.DATA_TRANSFER, ingressedBytes, { package: pkg, callsite, direction: 'ingress' });
                    metrics.increment(metrics.Types.DATA_TRANSFER, egressedBytes, { package: pkg, callsite, direction: 'egress' });
                    this.clickhouse.add([event]);
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
