import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clickhouse } from './clickhouse.js';
import { clickhouseClient } from './config.js';
import { migrate } from './migrate.js';

import type { ClickhouseRawUsageEvent } from './clickhouse.js';

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
            clickhouse.addRaw([
                // proxy
                ...genEventsN({ n: 10, date: dayFromNow(), type: 'usage.proxy', accountId, attributes: { success: true } }),
                ...genEventsN({ n: 11, date: dayFromNow(1), type: 'usage.proxy', accountId, attributes: { success: true } }),
                ...genEventsN({ n: 1, date: dayFromNow(2), type: 'usage.proxy', accountId, attributes: { success: true } }),
                ...genEventsN({ n: 12, date: dayFromNow(2), type: 'usage.proxy', accountId, attributes: { success: false } }), // same day but success: false
                ...genEventsN({ n: 10, date: dayFromNow(2), type: 'usage.proxy', accountId: 999 }), // different account
                ...genEventsN({ n: 10, date: dayFromNow(-1), type: 'usage.proxy', accountId }), // out of timeframe
                // functions
                ...genEventsN({
                    n: 1,
                    date: dayFromNow(),
                    type: 'usage.function_executions',
                    accountId,
                    attributes: { type: 'sync', telemetryBag: { durationMs: 10, customLogs: 10, proxyCalls: 10, memoryGb: 3 } }
                }),
                ...genEventsN({
                    n: 1,
                    date: dayFromNow(1),
                    type: 'usage.function_executions',
                    accountId,
                    attributes: { type: 'sync', telemetryBag: { durationMs: 1000, customLogs: 100, proxyCalls: 100, memoryGb: 3 } }
                }),
                ...genEventsN({
                    n: 1,
                    date: dayFromNow(1),
                    type: 'usage.function_executions',
                    accountId,
                    attributes: { type: 'webhook', telemetryBag: { durationMs: 100, customLogs: 10, proxyCalls: 10, memoryGb: 2 } }
                }),
                ...genEventsN({
                    n: 1,
                    date: dayFromNow(1),
                    type: 'usage.function_executions',
                    accountId,
                    attributes: { type: 'action', telemetryBag: { durationMs: 100, customLogs: 10, proxyCalls: 10, memoryGb: 0.5 } }
                }),
                // webhook_forwards
                ...genEventsN({ n: 3, date: dayFromNow(), type: 'usage.webhook_forward', accountId, attributes: { success: true } }),
                ...genEventsN({ n: 3, date: dayFromNow(), type: 'usage.webhook_forward', accountId, attributes: { success: false } }),
                ...genEventsN({ n: 3, date: dayFromNow(1), type: 'usage.webhook_forward', accountId, attributes: { success: true } }),
                // connections
                // day 0: average is 70
                genEvent({ date: dayFromNow(0), type: 'usage.connections', accountId, value: 50 }),
                genEvent({ date: dayFromNow(0), type: 'usage.connections', accountId, value: 60 }),
                genEvent({ date: dayFromNow(0), type: 'usage.connections', accountId, value: 100 }),
                // day 1: average is 10
                genEvent({ date: dayFromNow(1), type: 'usage.connections', accountId, value: 20 }),
                genEvent({ date: dayFromNow(1), type: 'usage.connections', accountId, value: 10 }),
                genEvent({ date: dayFromNow(1), type: 'usage.connections', accountId, value: 0 }),
                // records
                genEvent({ date: dayFromNow(0), type: 'usage.records', accountId, value: 1000, attributes: { integrationId: 'a' } }),
                genEvent({ date: dayFromNow(0), type: 'usage.records', accountId, value: 1100, attributes: { integrationId: 'a' } }),
                genEvent({ date: dayFromNow(0), type: 'usage.records', accountId, value: 500, attributes: { integrationId: 'b' } }),
                genEvent({ date: dayFromNow(1), type: 'usage.records', accountId, value: 1100, attributes: { integrationId: 'a' } }),
                genEvent({ date: dayFromNow(1), type: 'usage.records', accountId, value: 500, attributes: { integrationId: 'b' } })
            ]);
            await clickhouse.flush(); // force flush to make sure all events are ingested before we query
        });
        describe('with no granularity', () => {
            it('for a periodic metric', async () => {
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
            it('for a cumulative metric', async () => {
                const res = await clickhouse.getUsage({
                    accountId,
                    metrics: { connections: { dimension: 'none' } },
                    granularity: 'none',
                    timeframe: { start, end }
                });
                const expected = {
                    accountId: accountId,
                    granularity: 'none',
                    metrics: {
                        connections: {
                            series: [
                                {
                                    // (day0=70 + day1=10) / 7 days = 11
                                    dataPoints: [{ timeframe: { start, end }, quantity: 11 }],
                                    total: 11
                                }
                            ],
                            total: 11,
                            view_mode: 'cumulative'
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
                        connections: { dimension: 'none' },
                        records: { dimension: 'integration_id' }
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
                        },
                        // connections
                        connections: {
                            series: [
                                {
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 70 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 10 }
                                    ],
                                    total: 11
                                }
                            ],
                            total: 11,
                            view_mode: 'cumulative'
                        },
                        // records
                        records: {
                            series: [
                                {
                                    dimension: 'integration_id',
                                    dimensionValue: 'a',
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 1050 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 1100 }
                                    ],
                                    total: 307
                                },
                                {
                                    dimension: 'integration_id',
                                    dimensionValue: 'b',
                                    dataPoints: [
                                        { timeframe: { start: dayFromNow(), end: dayFromNow(1) }, quantity: 500 },
                                        { timeframe: { start: dayFromNow(1), end: dayFromNow(2) }, quantity: 500 }
                                    ],
                                    total: 143
                                }
                            ],
                            total: 450,
                            view_mode: 'cumulative'
                        }
                    }
                };
                expect(res.unwrap()).toStrictEqual(expected);
            });
        });
    });

    // Verifies the CH-platform contract we depend on: when the metering Batcher retries an
    // insert with the same insert_deduplication_token, ClickHouse dedupes at the block layer
    // and propagates the dedup to dependent MVs (so daily_* tables don't double-count).
    // If this test ever breaks, the entire retry-safety model is invalid.
    describe('insert_deduplication_token contract', () => {
        const dedupDatabase = `usage_dedup_test`;
        const dedupClickhouse = new Clickhouse({ database: dedupDatabase });

        afterAll(async () => {
            await dedupClickhouse.shutdown();
        });

        beforeAll(async () => {
            const client = clickhouseClient();
            await client?.command({ query: `DROP DATABASE IF EXISTS ${dedupDatabase}` });
            await client?.close();
            await migrate({ database: dedupDatabase });
        });

        // Block-level dedup requires a Replicated/Shared engine (ClickHouse Cloud's
        // SharedReplacingMergeTree). The local CH used by the testcontainer is plain
        // ReplacingMergeTree which doesn't implement insert_deduplicate at all, so this
        // test cannot run in CI. Verified manually in CH Cloud — see Linear doc:
        // https://linear.app/nango/document/avg-billing-metric-issues-7831f496d326
        it.skip('dedupes identical INSERTs with the same token (single MV firing)', async () => {
            const client = clickhouseClient({ database: dedupDatabase });
            if (!client) throw new Error('CLICKHOUSE_URL not set');

            const token = `dedup-token-${rnd.string()}`;
            const event = {
                ts: dayFromNow(0).getTime(),
                idempotency_key: rnd.string(),
                type: 'usage.proxy' as const,
                account_id: -999,
                value: 100,
                attributes: { success: true, environmentId: 1, environmentName: 'test', integrationId: 'test', connectionId: 'test' }
            };

            for (let i = 0; i < 3; i++) {
                await client.insert({
                    table: 'raw_events',
                    values: [event],
                    format: 'JSONEachRow',
                    clickhouse_settings: { insert_deduplication_token: token }
                });
            }

            // daily_proxy should reflect ONE MV firing — value=100, not 300.
            const result = await client.query({
                query: `SELECT SUM(value) AS total FROM ${dedupDatabase}.daily_proxy WHERE account_id = -999`,
                format: 'JSONEachRow'
            });
            const rows = await result.json();
            expect(Number(rows[0]?.total)).toBe(100);

            await client.close();
        });

        it('does not dedupe across distinct tokens', async () => {
            const client = clickhouseClient({ database: dedupDatabase });
            if (!client) throw new Error('CLICKHOUSE_URL not set');

            const accountId = -998;
            const event = {
                ts: dayFromNow(0).getTime(),
                idempotency_key: rnd.string(),
                type: 'usage.proxy' as const,
                account_id: accountId,
                value: 100,
                attributes: { success: true, environmentId: 1, environmentName: 'test', integrationId: 'test', connectionId: 'test' }
            };

            for (let i = 0; i < 3; i++) {
                // ts differs per iteration so each block hash differs too — pure token isolation test.
                await client.insert({
                    table: 'raw_events',
                    values: [{ ...event, ts: event.ts + i }],
                    format: 'JSONEachRow',
                    clickhouse_settings: { insert_deduplication_token: `distinct-token-${rnd.string()}` }
                });
            }

            // Three distinct logical inserts, each fires the MV → value=300.
            const result = await client.query({
                query: `SELECT SUM(value) AS total FROM ${dedupDatabase}.daily_proxy WHERE account_id = ${accountId}`,
                format: 'JSONEachRow'
            });
            const rows = await result.json();
            expect(Number(rows[0]?.total)).toBe(300);

            await client.close();
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
    number: (exclusiveMax: number = 1000) => Math.floor(Math.random() * exclusiveMax),
    string: () => Math.random().toString(36).substring(6),
    time(date: Date): Date {
        date.setHours(rnd.number(24), rnd.number(60), rnd.number(60), 0);
        return date;
    }
};

function genEventsN({
    n,
    date,
    type,
    accountId,
    attributes = {}
}: {
    n: number;
    date: Date;
    type: ClickhouseRawUsageEvent['type'];
    accountId: ClickhouseRawUsageEvent['account_id'];
    attributes?: Partial<ClickhouseRawUsageEvent['attributes']>;
}): ClickhouseRawUsageEvent[] {
    return Array.from({ length: n }).map((_) => genEvent({ date, type, accountId, attributes }));
}

function genEvent({
    date,
    type,
    accountId,
    value = 1,
    attributes = {}
}: {
    date: Date;
    type: ClickhouseRawUsageEvent['type'];
    accountId: ClickhouseRawUsageEvent['account_id'];
    value?: number;
    attributes?: Partial<ClickhouseRawUsageEvent['attributes']>;
}): ClickhouseRawUsageEvent {
    const baseAttributes = {
        environmentId: 1,
        environmentName: 'test',
        integrationId: 'test',
        connectionId: 'test'
    };
    switch (type) {
        case 'usage.proxy':
            return {
                ts: date.getTime(),
                type,
                idempotency_key: rnd.string(),
                account_id: accountId,
                value,
                attributes: {
                    success: true,
                    ...baseAttributes,
                    ...attributes
                }
            };

        case 'usage.function_executions':
            return {
                ts: date.getTime(),
                type,
                idempotency_key: rnd.string(),
                account_id: accountId,
                value,
                attributes: {
                    ...baseAttributes,
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
                    ...attributes
                }
            };

        case 'usage.webhook_forward':
            return {
                ts: date.getTime(),
                type,
                idempotency_key: rnd.string(),
                account_id: accountId,

                value,
                attributes: {
                    ...baseAttributes,
                    success: true,
                    ...attributes
                }
            };

        case 'usage.records':
            return {
                ts: date.getTime(),
                type,
                idempotency_key: rnd.string(),
                account_id: accountId,
                value,
                attributes: {
                    ...baseAttributes,
                    model: 'test',
                    ...attributes
                }
            };

        case 'usage.connections':
            return {
                ts: date.getTime(),
                type,
                idempotency_key: rnd.string(),
                account_id: accountId,
                value,
                attributes: {
                    ...baseAttributes,
                    ...attributes
                }
            };

        default:
            throw new Error(`Unsupported event type ${type}`);
    }
}
