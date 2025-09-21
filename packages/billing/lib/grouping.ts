import type { Grouping } from './batcher.js';
import type { BillingEvent } from '@nangohq/types';

export class BillingEventGrouping implements Grouping<BillingEvent> {
    groupingKey(event: BillingEvent): string {
        const { type, properties } = event;

        let nonGroupingKeys: string[];
        const commonNonGroupingKeys = ['idempotencyKey', 'timestamp', 'count'];
        switch (type) {
            case 'billable_actions':
                nonGroupingKeys = commonNonGroupingKeys;
                break;
            case 'function_executions':
                nonGroupingKeys = [...commonNonGroupingKeys, 'telemetry'];
                break;
            case 'monthly_active_records':
                nonGroupingKeys = commonNonGroupingKeys;
                break;
            case 'billable_active_connections':
                nonGroupingKeys = commonNonGroupingKeys;
                break;
            case 'billable_connections':
                nonGroupingKeys = commonNonGroupingKeys;
                break;
            default:
                ((_: never) => {
                    throw new Error(`Unhandled event type`);
                })(type);
        }

        const groupingEntries: [string, string | number][] = Object.entries(properties).filter(([key]) => !nonGroupingKeys.includes(key));

        const propPairs = groupingEntries
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}:${value}`)
            .join('|');

        return `${type}|${propPairs}`;
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
                            customLogs: _a.properties.telemetry.customLogs + b.properties.telemetry.customLogs,
                            proxyCalls: _a.properties.telemetry.proxyCalls + b.properties.telemetry.proxyCalls,
                            successes: _a.properties.telemetry.successes + b.properties.telemetry.successes,
                            failures: _a.properties.telemetry.failures + b.properties.telemetry.failures
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
