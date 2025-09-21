import { describe, expect, it } from 'vitest';

import { BillingEventGrouping } from './grouping.js';

import type { BillingEvent } from '@nangohq/types';

describe('BillingEventGrouping', () => {
    const grouping = new BillingEventGrouping();

    describe('groupingKey', () => {
        it('should be correct for all BillingEvents', () => {});

        const events: BillingEvent[] = [
            {
                type: 'billable_actions',
                properties: {
                    accountId: 1,
                    actionName: 'action1',
                    connectionId: 2,
                    environmentId: 3,
                    providerConfigKey: 'providerConfigKey1',
                    count: 5,
                    timestamp: new Date()
                }
            },
            {
                type: 'function_executions',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    type: 'action',
                    telemetry: {
                        customLogs: 7,
                        proxyCalls: 3,
                        successes: 2,
                        failures: 1
                    },
                    count: 10,
                    timestamp: new Date()
                }
            },
            {
                type: 'function_executions',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    type: 'sync',
                    frequencyMs: 100,
                    telemetry: {
                        customLogs: 10,
                        proxyCalls: 3,
                        successes: 6,
                        failures: 1
                    },
                    count: 20,
                    timestamp: new Date()
                }
            },
            {
                type: 'monthly_active_records',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    environmentId: 3,
                    model: 'model1',
                    providerConfigKey: 'providerConfigKey2',
                    syncId: 'sync1',
                    count: 15,
                    timestamp: new Date()
                }
            },
            {
                type: 'billable_connections',
                properties: {
                    accountId: 1,
                    count: 11,
                    timestamp: new Date()
                }
            },
            {
                type: 'billable_active_connections',
                properties: {
                    accountId: 1,
                    count: 12,
                    timestamp: new Date()
                }
            }
        ];
        const keys = events.map((e) => grouping.groupingKey(e));
        expect(keys).toEqual([
            'billable_actions|accountId:1|actionName:action1|connectionId:2|environmentId:3|providerConfigKey:providerConfigKey1',
            'function_executions|accountId:1|connectionId:2|type:action',
            'function_executions|accountId:1|connectionId:2|frequencyMs:100|type:sync',
            'monthly_active_records|accountId:1|connectionId:2|environmentId:3|model:model1|providerConfigKey:providerConfigKey2|syncId:sync1',
            'billable_connections|accountId:1',
            'billable_active_connections|accountId:1'
        ]);
    });

    describe('aggregate', () => {
        it('should work for billable_active_connections', () => {
            const a: BillingEvent = {
                type: 'billable_active_connections',
                properties: {
                    accountId: 1,
                    count: 5,
                    timestamp: new Date('2024-01-01T00:00:00Z')
                }
            };
            const b: BillingEvent = {
                type: 'billable_active_connections',
                properties: {
                    accountId: 1,
                    count: 7,
                    timestamp: new Date('2024-01-02T00:00:00Z')
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toEqual(b);
        });
        it('should work for billable_connections', () => {
            const a: BillingEvent = {
                type: 'billable_connections',
                properties: {
                    accountId: 1,
                    count: 5,
                    timestamp: new Date('2024-01-01T00:00:00Z')
                }
            };
            const b: BillingEvent = {
                type: 'billable_connections',
                properties: {
                    accountId: 1,
                    count: 7,
                    timestamp: new Date('2024-01-02T00:00:00Z')
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toEqual(b);
        });
        it('should work for billable_actions', () => {
            const a: BillingEvent = {
                type: 'billable_actions',
                properties: {
                    accountId: 1,
                    actionName: 'action1',
                    connectionId: 2,
                    environmentId: 3,
                    providerConfigKey: 'providerConfigKey1',
                    count: 5,
                    timestamp: new Date('2024-01-01T00:00:00Z')
                }
            };
            const b: BillingEvent = {
                type: 'billable_actions',
                properties: {
                    accountId: 1,
                    actionName: 'action1',
                    connectionId: 2,
                    environmentId: 3,
                    providerConfigKey: 'providerConfigKey1',
                    count: 7,
                    timestamp: new Date('2024-01-02T00:00:00Z')
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toMatchObject({
                type: 'billable_actions',
                properties: {
                    accountId: 1,
                    actionName: 'action1',
                    connectionId: 2,
                    environmentId: 3,
                    providerConfigKey: 'providerConfigKey1',
                    count: 12,
                    timestamp: new Date('2024-01-02T00:00:00Z')
                }
            });
        });
        it('should work for monthly_active_records', () => {
            const a: BillingEvent = {
                type: 'monthly_active_records',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    environmentId: 3,
                    model: 'model1',
                    providerConfigKey: 'providerConfigKey2',
                    syncId: 'sync1',
                    count: 5,
                    timestamp: new Date('2024-01-01T00:00:00Z')
                }
            };
            const b: BillingEvent = {
                type: 'monthly_active_records',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    environmentId: 3,
                    model: 'model1',
                    providerConfigKey: 'providerConfigKey2',
                    syncId: 'sync1',
                    count: 7,
                    timestamp: new Date('2024-01-02T00:00:00Z')
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toMatchObject({
                type: 'monthly_active_records',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    environmentId: 3,
                    model: 'model1',
                    providerConfigKey: 'providerConfigKey2',
                    syncId: 'sync1',
                    count: 12,
                    timestamp: new Date('2024-01-02T00:00:00Z')
                }
            });
        });
        it('should work for function_executions', () => {
            const a: BillingEvent = {
                type: 'function_executions',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    type: 'sync',
                    frequencyMs: 100,
                    telemetry: {
                        customLogs: 10,
                        proxyCalls: 3,
                        successes: 6,
                        failures: 1
                    },
                    count: 20,
                    timestamp: new Date('2024-01-01T00:00:00Z')
                }
            };
            const b: BillingEvent = {
                type: 'function_executions',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    type: 'sync',
                    frequencyMs: 100,
                    telemetry: {
                        customLogs: 5,
                        proxyCalls: 1,
                        successes: 7,
                        failures: 2
                    },
                    count: 30,
                    timestamp: new Date('2024-01-02T00:00:00Z')
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toMatchObject({
                type: 'function_executions',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    type: 'sync',
                    frequencyMs: 100,
                    count: 50,
                    timestamp: new Date('2024-01-02T00:00:00Z'),
                    telemetry: {
                        customLogs: 15,
                        failures: 3,
                        proxyCalls: 4,
                        successes: 13
                    }
                }
            });
        });
    });
});
