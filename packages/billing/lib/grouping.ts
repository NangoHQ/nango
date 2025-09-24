import type { Grouping } from './batcher.js';
import type { BillingEvent } from '@nangohq/types';

function omitProperties<T extends BillingEvent, K extends keyof T['properties'], O = Omit<T['properties'], K>, R = [keyof O, O[keyof O]][]>(
    event: T,
    keys: K[]
): R {
    const keySet = new Set(keys);
    const entries = Object.entries(event.properties).filter(([key]) => !keySet.has(key as K));
    return entries as R;
}

export class BillingEventGrouping implements Grouping<BillingEvent> {
    groupingKey(event: BillingEvent): string {
        const groupingProperties = () => {
            switch (event.type) {
                case 'billable_actions':
                    return omitProperties(event, ['idempotencyKey', 'timestamp', 'count']);
                case 'proxy':
                    return omitProperties(event, ['idempotencyKey', 'timestamp', 'count', 'telemetry']);
                case 'webhook_forwards':
                    return omitProperties(event, ['idempotencyKey', 'timestamp', 'count']);
                case 'function_executions':
                    return omitProperties(event, ['idempotencyKey', 'timestamp', 'count', 'telemetry']);
                case 'monthly_active_records':
                    return omitProperties(event, ['idempotencyKey', 'timestamp', 'count']);
                case 'billable_active_connections':
                    return omitProperties(event, ['idempotencyKey', 'timestamp', 'count']);
                case 'billable_connections':
                    return omitProperties(event, ['idempotencyKey', 'timestamp', 'count']);
                default:
                    ((_: never) => {
                        throw new Error(`Unhandled event type`);
                    })(event);
            }
        };

        const propertiesKey = groupingProperties()
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => {
                if (typeof value === 'object') {
                    return `${key}:${JSON.stringify(value)}`;
                }
                return `${key}:${value}`;
            })
            .join('|');

        return `${event.type}|${propertiesKey}`;
    }

    // IMPORTANT: do not use spread operator, forcing all the properties to be explicitly specified
    aggregate(a: BillingEvent, b: BillingEvent): BillingEvent {
        if (b.type !== a.type) {
            return b; // not the same type, cannot aggregate
        }
        switch (b.type) {
            case 'billable_actions':
                return {
                    type: b.type,
                    properties: {
                        timestamp: b.properties.timestamp,
                        idempotencyKey: b.properties.idempotencyKey,
                        accountId: b.properties.accountId,
                        environmentId: b.properties.environmentId,
                        connectionId: b.properties.connectionId,
                        providerConfigKey: b.properties.providerConfigKey,
                        actionName: b.properties.actionName,
                        count: a.properties.count + b.properties.count
                    }
                };
            case 'proxy': {
                const _a = a as typeof b; // To satisfy ts compiler that b has the same type as a
                return {
                    type: b.type,
                    properties: {
                        count: _a.properties.count + b.properties.count,
                        timestamp: b.properties.timestamp,
                        idempotencyKey: b.properties.idempotencyKey,
                        accountId: b.properties.accountId,
                        environmentId: b.properties.environmentId,
                        connectionId: b.properties.connectionId,
                        providerConfigKey: b.properties.providerConfigKey,
                        provider: b.properties.provider,
                        telemetry: {
                            successes: _a.properties.telemetry.successes + b.properties.telemetry.successes,
                            failures: _a.properties.telemetry.failures + b.properties.telemetry.failures
                        }
                    }
                };
            }
            case 'webhook_forwards':
                return {
                    type: b.type,
                    properties: {
                        timestamp: b.properties.timestamp,
                        idempotencyKey: b.properties.idempotencyKey,
                        accountId: b.properties.accountId,
                        environmentId: b.properties.environmentId,
                        provider: b.properties.provider,
                        providerConfigKey: b.properties.providerConfigKey,
                        count: a.properties.count + b.properties.count
                    }
                };
            case 'monthly_active_records':
                return {
                    type: b.type,
                    properties: {
                        timestamp: b.properties.timestamp,
                        idempotencyKey: b.properties.idempotencyKey,
                        accountId: b.properties.accountId,
                        connectionId: b.properties.connectionId,
                        environmentId: b.properties.environmentId,
                        providerConfigKey: b.properties.providerConfigKey,
                        syncId: b.properties.syncId,
                        model: b.properties.model,
                        count: a.properties.count + b.properties.count
                    }
                };
            case 'function_executions': {
                const _a = a as typeof b; // To satisfy ts compiler that b has the same type as a
                return {
                    type: b.type,
                    properties: {
                        idempotencyKey: b.properties.idempotencyKey,
                        timestamp: b.properties.timestamp,
                        accountId: b.properties.accountId,
                        type: b.properties.type,
                        connectionId: b.properties.connectionId,
                        count: a.properties.count + b.properties.count,
                        frequencyMs: b.properties.frequencyMs,
                        telemetry: {
                            successes: _a.properties.telemetry.successes + b.properties.telemetry.successes,
                            failures: _a.properties.telemetry.failures + b.properties.telemetry.failures,
                            durationMs: _a.properties.telemetry.durationMs + b.properties.telemetry.durationMs,
                            memoryGb: _a.properties.telemetry.memoryGb + b.properties.telemetry.memoryGb,
                            customLogs: _a.properties.telemetry.customLogs + b.properties.telemetry.customLogs,
                            proxyCalls: _a.properties.telemetry.proxyCalls + b.properties.telemetry.proxyCalls
                        }
                    }
                };
            }
            case 'billable_connections':
                return b; // billable connections are already aggregated
            case 'billable_active_connections':
                return b; // billable active connections are already aggregated
            default:
                ((_: never) => {
                    throw new Error(`Unhandled event type`);
                })(b);
        }
    }
}
