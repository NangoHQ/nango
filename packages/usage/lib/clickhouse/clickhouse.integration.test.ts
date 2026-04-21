import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clickhouse } from './clickhouse.js';
import { clickhouseClient } from './config.js';
import { migrate } from './migrate.js';

import type { UsageEvent } from '@nangohq/types';

describe('Clickhouse', () => {
    const database = `usage_test`;
    const clickhouse = new Clickhouse({ database });

    afterAll(async () => {
        await clickhouse.shutdown();
    });

    const cleanup = async () => {
        const cleanupClient = clickhouseClient();
        await cleanupClient?.command({ query: `DROP DATABASE IF EXISTS ${database}` });
        await cleanupClient?.close();
        await migrate({ database });
    };

    describe('should ingest and retrieve usage', () => {
        const accountId = 1;
        const start = dayFromNow();
        const end = dayFromNow(7);

        beforeAll(async () => {
            await cleanup();
            clickhouse.add([
                // proxy
                ...genEventsN({ n: 10, day: dayFromNow(), type: 'usage.proxy', accountId, properties: { success: true } }),
                ...genEventsN({ n: 11, day: dayFromNow(1), type: 'usage.proxy', accountId, properties: { success: true } }),
                ...genEventsN({ n: 1, day: dayFromNow(2), type: 'usage.proxy', accountId, properties: { success: true } }),
                ...genEventsN({ n: 12, day: dayFromNow(2), type: 'usage.proxy', accountId, properties: { success: false } }), // same day but success: false
                ...genEventsN({ n: 10, day: dayFromNow(2), type: 'usage.proxy', accountId: 999 }), // different account
                ...genEventsN({ n: 10, day: dayFromNow(-1), type: 'usage.proxy', accountId }), // out of timeframe
                // functions
                ...genEventsN({
                    n: 1,
                    day: dayFromNow(),
                    type: 'usage.function_executions',
                    accountId,
                    properties: { type: 'sync', telemetryBag: { durationMs: 10, customLogs: 10, proxyCalls: 10, memoryGb: 3 } }
                }),
                ...genEventsN({
                    n: 1,
                    day: dayFromNow(1),
                    type: 'usage.function_executions',
                    accountId,
                    properties: { type: 'sync', telemetryBag: { durationMs: 1000, customLogs: 100, proxyCalls: 100, memoryGb: 3 } }
                }),
                ...genEventsN({
                    n: 1,
                    day: dayFromNow(1),
                    type: 'usage.function_executions',
                    accountId,
                    properties: { type: 'webhook', telemetryBag: { durationMs: 100, customLogs: 10, proxyCalls: 10, memoryGb: 2 } }
                }),
                ...genEventsN({
                    n: 1,
                    day: dayFromNow(1),
                    type: 'usage.function_executions',
                    accountId,
                    properties: { type: 'action', telemetryBag: { durationMs: 100, customLogs: 10, proxyCalls: 10, memoryGb: 0.5 } }
                }),
                // webhook_forwards
                ...genEventsN({ n: 3, day: dayFromNow(), type: 'usage.webhook_forward', accountId, properties: { success: true } }),
                ...genEventsN({ n: 3, day: dayFromNow(), type: 'usage.webhook_forward', accountId, properties: { success: false } }),
                ...genEventsN({ n: 3, day: dayFromNow(1), type: 'usage.webhook_forward', accountId, properties: { success: true } })
            ]);
            await clickhouse.flush(); // force flush to make sure all events are ingested before we query
        });
        describe('with no granularity', () => {
            it('for a single metric', async () => {
                const res = await clickhouse.getUsage({
                    accountId,
                    metrics: { proxy: { dimension: 'none' } },
                    granularity: 'none',
                    timeframe: { start, end }
                });
                const expected = {
                    accountId: accountId,
                    granularity: 'none',
                    metrics: {
                        proxy: {
                            series: [
                                {
                                    dataPoints: [{ timeframe: { start, end }, quantity: 34 }],
                                    total: 34
                                }
                            ],
                            total: 34,
                            view_mode: 'periodic'
                        }
                    }
                };
                expect(res.unwrap()).toStrictEqual(expected);
            });
        });

        describe('with day granularity', () => {
            it('for a single metric', async () => {
                const res = await clickhouse.getUsage({
                    accountId,
                    metrics: { proxy: { dimension: 'none' } },
                    granularity: 'day',
                    timeframe: { start, end }
                });
                const expected = {
                    accountId: accountId,
                    granularity: 'day',
                    metrics: {
                        proxy: {
                            series: [
                                {
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 10 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 11 },
                                        { timeframe: { start: dayFromNow(2), end: dayFromNow(3) }, quantity: 13 }
                                    ],
                                    total: 34
                                }
                            ],
                            total: 34,
                            view_mode: 'periodic'
                        }
                    }
                };
                expect(res.unwrap()).toStrictEqual(expected);
            });

            it('with dimension', async () => {
                const res = await clickhouse.getUsage({
                    accountId,
                    metrics: { proxy: { dimension: 'success' } },
                    granularity: 'day',
                    timeframe: { start, end }
                });
                const expected = {
                    accountId: accountId,
                    granularity: 'day',
                    metrics: {
                        proxy: {
                            series: [
                                {
                                    dimension: 'success',
                                    dimensionValue: false,
                                    dataPoints: [{ timeframe: { start: dayFromNow(2), end: dayFromNow(3) }, quantity: 12 }],
                                    total: 12
                                },
                                {
                                    dimension: 'success',
                                    dimensionValue: true,
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 10 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 11 },
                                        { timeframe: { start: dayFromNow(2), end: dayFromNow(3) }, quantity: 1 }
                                    ],
                                    total: 22
                                }
                            ],
                            total: 34,
                            view_mode: 'periodic'
                        }
                    }
                };
                expect(res.unwrap()).toStrictEqual(expected);
            });

            it('for a single metric on a single day', async () => {
                const res = await clickhouse.getUsage({
                    accountId,
                    metrics: { proxy: { dimension: 'none' } },
                    granularity: 'day',
                    timeframe: { start: dayFromNow(1), end: dayFromNow(2) }
                });
                const expected = {
                    accountId: accountId,
                    granularity: 'day',
                    metrics: {
                        proxy: {
                            series: [
                                {
                                    dataPoints: [{ timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 11 }],
                                    total: 11
                                }
                            ],
                            total: 11,
                            view_mode: 'periodic'
                        }
                    }
                };
                expect(res.unwrap()).toStrictEqual(expected);
            });

            it('for multiple metrics', async () => {
                const res = await clickhouse.getUsage({
                    accountId,
                    metrics: {
                        proxy: { dimension: 'success' },
                        function_executions: { dimension: 'function_type' },
                        function_logs: { dimension: 'none' },
                        function_compute_gbms: { dimension: 'none' },
                        webhook_forwards: { dimension: 'none' },
                        records: { dimension: 'connection_id' },
                        connections: { dimension: 'integration_id' }
                    },
                    granularity: 'day',
                    timeframe: { start, end }
                });
                const expected = {
                    accountId: accountId,
                    granularity: 'day',
                    metrics: {
                        proxy: {
                            series: [
                                {
                                    dimension: 'success',
                                    dimensionValue: false,
                                    dataPoints: [{ timeframe: { start: dayFromNow(2), end: dayFromNow(3) }, quantity: 12 }],
                                    total: 12
                                },
                                {
                                    dimension: 'success',
                                    dimensionValue: true,
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 10 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 11 },
                                        { timeframe: { start: dayFromNow(2), end: dayFromNow(3) }, quantity: 1 }
                                    ],
                                    total: 22
                                }
                            ],
                            total: 34,
                            view_mode: 'periodic'
                        },
                        function_executions: {
                            series: [
                                {
                                    dimension: 'function_type',
                                    dimensionValue: 'action',
                                    dataPoints: [{ timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 1 }],
                                    total: 1
                                },
                                {
                                    dimension: 'function_type',
                                    dimensionValue: 'sync',
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 1 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 1 }
                                    ],
                                    total: 2
                                },
                                {
                                    dimension: 'function_type',
                                    dimensionValue: 'webhook',
                                    dataPoints: [{ timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 1 }],
                                    total: 1
                                }
                            ],
                            total: 4,
                            view_mode: 'periodic'
                        },
                        function_logs: {
                            series: [
                                {
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 10 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 120 }
                                    ],
                                    total: 130
                                }
                            ],
                            total: 130,
                            view_mode: 'periodic'
                        },
                        function_compute_gbms: {
                            series: [
                                {
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 30 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 3250 }
                                    ],
                                    total: 3280
                                }
                            ],
                            total: 3280,
                            view_mode: 'periodic'
                        },

                        // function webhook_forwards
                        webhook_forwards: {
                            series: [
                                {
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 6 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 3 }
                                    ],
                                    total: 9
                                }
                            ],
                            total: 9,
                            view_mode: 'periodic'
                        }

                        // TODO:
                        // connections
                        // records
                    }
                };
                expect(res.unwrap()).toStrictEqual(expected);
            });
        });
    });
});

function dayFromNow(dayOffset = 0): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + dayOffset);
    return date;
}

const rnd = {
    datetime: (d: Date) => {
        return new Date(d.getTime() + Math.floor(Math.random() * 24 * 60 * 60 * 1000));
    },
    number: () => Math.floor(Math.random() * 1000),
    string: () => Math.random().toString(36).substring(6)
};

function genEventsN({
    n,
    day,
    type,
    accountId,
    properties = {}
}: {
    n: number;
    day: Date;
    type: UsageEvent['type'];
    accountId: UsageEvent['payload']['properties']['accountId'];
    properties?: Partial<UsageEvent['payload']['properties']>;
}): UsageEvent[] {
    return Array.from({ length: n }).map((_) => genEvent({ day, type, accountId, properties }));
}

function genEvent({
    day,
    type,
    accountId,
    properties
}: {
    day: Date;
    type: UsageEvent['type'];
    accountId: UsageEvent['payload']['properties']['accountId'];
    properties: Partial<UsageEvent['payload']['properties']>;
}): UsageEvent {
    const baseProperties = {
        accountId,
        environmentId: 1,
        environmentName: 'test',
        integrationId: 'test',
        connectionId: 'test'
    };
    switch (type) {
        case 'usage.proxy':
            return {
                createdAt: rnd.datetime(day),
                subject: 'usage',
                type,
                idempotencyKey: rnd.string(),
                payload: {
                    value: 1,
                    properties: {
                        success: true,
                        ...baseProperties,
                        ...properties
                    }
                }
            };

        case 'usage.function_executions':
            return {
                createdAt: rnd.datetime(day),
                subject: 'usage',
                type,
                idempotencyKey: rnd.string(),
                payload: {
                    value: 1,
                    properties: {
                        ...baseProperties,
                        type: 'sync',
                        functionName: 'test',
                        telemetryBag: {
                            durationMs: 1,
                            customLogs: 1,
                            proxyCalls: 1,
                            memoryGb: 1
                        },
                        runtime: 'lambda',
                        success: true,
                        ...properties
                    }
                }
            };

        case 'usage.webhook_forward':
            return {
                createdAt: rnd.datetime(day),
                subject: 'usage',
                type,
                idempotencyKey: rnd.string(),
                payload: {
                    value: 1,
                    properties: {
                        ...baseProperties,
                        success: true,
                        ...properties
                    }
                }
            };

        case 'usage.records':
            return {
                createdAt: rnd.datetime(day),
                subject: 'usage',
                type,
                idempotencyKey: rnd.string(),
                payload: {
                    value: 1,
                    properties: {
                        ...baseProperties,
                        syncId: rnd.string(),
                        model: 'test',
                        ...properties
                    }
                }
            };

        case 'usage.connections':
            return {
                createdAt: rnd.datetime(day),
                subject: 'usage',
                type,
                idempotencyKey: rnd.string(),
                payload: {
                    value: 1,
                    properties: {
                        ...baseProperties,
                        ...properties
                    }
                }
            };

        case 'usage.actions':
            return {
                createdAt: rnd.datetime(day),
                subject: 'usage',
                type,
                idempotencyKey: rnd.string(),
                payload: {
                    value: 1,
                    properties: {
                        ...baseProperties,
                        actionName: 'test',
                        ...properties
                    }
                }
            };

        case 'usage.monthly_active_records':
            return {
                createdAt: rnd.datetime(day),
                subject: 'usage',
                type,
                idempotencyKey: rnd.string(),
                payload: {
                    value: 1,
                    properties: {
                        ...baseProperties,
                        model: 'test',
                        syncId: 'test'
                    }
                }
            };
    }
}
