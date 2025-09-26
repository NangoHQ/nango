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
                type: 'proxy',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    environmentId: 3,
                    providerConfigKey: 'providerConfigKey1',
                    provider: 'provider1',
                    telemetry: {
                        successes: 4,
                        failures: 0
                    },
                    count: 8,
                    timestamp: new Date()
                }
            },
            {
                type: 'webhook_forwards',
                properties: {
                    accountId: 1,
                    environmentId: 3,
                    provider: 'provider1',
                    providerConfigKey: 'providerConfigKey1',
                    count: 6,
                    timestamp: new Date(),
                    telemetry: {
                        successes: 6,
                        failures: 0
                    }
                }
            },
            {
                type: 'function_executions',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    type: 'action',
                    telemetry: {
                        successes: 2,
                        failures: 0,
                        durationMs: 150,
                        compute: 230,
                        customLogs: 7,
                        proxyCalls: 3
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
                        durationMs: 200,
                        compute: 200,
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
                type: 'records',
                properties: {
                    accountId: 1,
                    environmentId: 3,
                    count: 100,
                    timestamp: new Date(),
                    frequencyMs: 60_000,
                    telemetry: {
                        sizeBytes: 2048
                    }
                }
            },
            {
                type: 'billable_connections_v2',
                properties: {
                    accountId: 1,
                    count: 10,
                    timestamp: new Date(),
                    frequencyMs: 86_400_000
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
        const keys = events.map((event) => grouping.groupingKey(event));
        expect(keys).toEqual([
            'billable_actions|accountId:1|actionName:action1|connectionId:2|environmentId:3|providerConfigKey:providerConfigKey1',
            'proxy|accountId:1|connectionId:2|environmentId:3|provider:provider1|providerConfigKey:providerConfigKey1',
            'webhook_forwards|accountId:1|environmentId:3|provider:provider1|providerConfigKey:providerConfigKey1',
            'function_executions|accountId:1|connectionId:2|type:action',
            'function_executions|accountId:1|connectionId:2|frequencyMs:100|type:sync',
            'monthly_active_records|accountId:1|connectionId:2|environmentId:3|model:model1|providerConfigKey:providerConfigKey2|syncId:sync1',
            'records|accountId:1|environmentId:3',
            'billable_connections_v2|accountId:1',
            'billable_connections|accountId:1',
            'billable_active_connections|accountId:1'
        ]);
    });

    describe('aggregate', () => {
        it('should aggregate billable_active_connections', () => {
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
        it('should aggregate billable_connections', () => {
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
        it('should aggregate billable_actions', () => {
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
        it('should aggregate monthly_active_records', () => {
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
        it('should aggregate function_executions', () => {
            const a: BillingEvent = {
                type: 'function_executions',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    type: 'sync',
                    frequencyMs: 100,
                    telemetry: {
                        successes: 6,
                        failures: 1,
                        durationMs: 200,
                        compute: 100,
                        customLogs: 10,
                        proxyCalls: 3
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
                        successes: 7,
                        failures: 2,
                        durationMs: 100,
                        compute: 50,
                        customLogs: 5,
                        proxyCalls: 1
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
                        durationMs: 300,
                        compute: 150,
                        proxyCalls: 4,
                        successes: 13
                    }
                }
            });
        });
        it('should aggregate proxy', () => {
            const a: BillingEvent = {
                type: 'proxy',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    environmentId: 3,
                    providerConfigKey: 'providerConfigKey1',
                    provider: 'provider1',
                    telemetry: {
                        successes: 4,
                        failures: 0
                    },
                    count: 8,
                    timestamp: new Date('2024-01-01T00:00:00Z')
                }
            };
            const b: BillingEvent = {
                type: 'proxy',
                properties: {
                    accountId: 1,
                    connectionId: 2,
                    environmentId: 3,
                    providerConfigKey: 'providerConfigKey1',
                    provider: 'provider1',
                    telemetry: {
                        successes: 0,
                        failures: 1
                    },
                    count: 12,
                    timestamp: new Date('2024-01-02T00:00:00Z')
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toMatchObject({
                type: 'proxy',
                properties: {
                    count: 20,
                    timestamp: new Date('2024-01-02T00:00:00Z'),
                    accountId: 1,
                    connectionId: 2,
                    environmentId: 3,
                    providerConfigKey: 'providerConfigKey1',
                    provider: 'provider1',
                    telemetry: {
                        successes: 4,
                        failures: 1
                    }
                }
            });
        });
        it('should aggregate webhook_forwards', () => {
            const a: BillingEvent = {
                type: 'webhook_forwards',
                properties: {
                    accountId: 1,
                    environmentId: 3,
                    provider: 'provider1',
                    providerConfigKey: 'providerConfigKey1',
                    count: 6,
                    timestamp: new Date('2024-01-01T00:00:00Z'),
                    telemetry: {
                        successes: 6,
                        failures: 0
                    }
                }
            };
            const b: BillingEvent = {
                type: 'webhook_forwards',
                properties: {
                    accountId: 1,
                    environmentId: 3,
                    provider: 'provider1',
                    providerConfigKey: 'providerConfigKey1',
                    count: 15,
                    timestamp: new Date('2024-01-02T00:00:00Z'),
                    telemetry: {
                        successes: 15,
                        failures: 0
                    }
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toMatchObject({
                type: 'webhook_forwards',
                properties: {
                    accountId: 1,
                    environmentId: 3,
                    provider: 'provider1',
                    providerConfigKey: 'providerConfigKey1',
                    count: 21,
                    timestamp: new Date('2024-01-02T00:00:00Z'),
                    telemetry: {
                        successes: 21,
                        failures: 0
                    }
                }
            });
        });
        it('should aggregate records', () => {
            const a: BillingEvent = {
                type: 'records',
                properties: {
                    accountId: 1,
                    environmentId: 3,
                    count: 6,
                    timestamp: new Date('2024-01-01T00:00:00Z'),
                    frequencyMs: 60_000,
                    telemetry: {
                        sizeBytes: 2048
                    }
                }
            };
            const b: BillingEvent = {
                type: 'records',
                properties: {
                    accountId: 1,
                    environmentId: 3,
                    count: 30,
                    timestamp: new Date('2024-01-02T00:00:00Z'),
                    frequencyMs: 60_000,
                    telemetry: {
                        sizeBytes: 4096
                    }
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toMatchObject({
                type: 'records',
                properties: {
                    accountId: 1,
                    environmentId: 3,
                    count: 36,
                    timestamp: new Date('2024-01-02T00:00:00Z'),
                    frequencyMs: 60_000,
                    telemetry: {
                        sizeBytes: 6144
                    }
                }
            });
        });
        it('should aggregate billable_connections_v2', () => {
            const a: BillingEvent = {
                type: 'billable_connections_v2',
                properties: {
                    accountId: 1,
                    count: 7,
                    timestamp: new Date('2024-01-01T00:00:00Z'),
                    frequencyMs: 60_000
                }
            };
            const b: BillingEvent = {
                type: 'billable_connections_v2',
                properties: {
                    accountId: 1,
                    count: 40,
                    timestamp: new Date('2024-01-02T00:00:00Z'),
                    frequencyMs: 60_000
                }
            };
            const aggregated = grouping.aggregate(a, b);
            expect(aggregated).toMatchObject({
                type: 'billable_connections_v2',
                properties: {
                    accountId: 1,
                    count: 47,
                    timestamp: new Date('2024-01-02T00:00:00Z'),
                    frequencyMs: 60_000
                }
            });
        });
    });
});
