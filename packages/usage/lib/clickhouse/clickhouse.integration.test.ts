import { uuidv7 } from 'uuidv7';
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
        describe('getDailyCounter', () => {
            it('for a single metric, no dimension', async () => {
                const res = await clickhouse.getDailyCounter({
                    accountId,
                    metric: 'proxy',
                    dimension: 'none',
                    timeframe: { start, end }
                });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'proxy',
                    series: [
                        {
                            days: [
                                { day: dayFromNow(), value: 10 },
                                { day: dayFromNow(1), value: 11 },
                                { day: dayFromNow(2), value: 13 }
                            ]
                        }
                    ]
                });
            });

            it('with dimension', async () => {
                const res = await clickhouse.getDailyCounter({
                    accountId,
                    metric: 'proxy',
                    dimension: 'success',
                    timeframe: { start, end }
                });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'proxy',
                    series: [
                        {
                            dimension: 'success',
                            dimensionValue: false,
                            days: [{ day: dayFromNow(2), value: 12 }]
                        },
                        {
                            dimension: 'success',
                            dimensionValue: true,
                            days: [
                                { day: dayFromNow(), value: 10 },
                                { day: dayFromNow(1), value: 11 },
                                { day: dayFromNow(2), value: 1 }
                            ]
                        }
                    ]
                });
            });

            it('for a single metric on a single day', async () => {
                const res = await clickhouse.getDailyCounter({
                    accountId,
                    metric: 'proxy',
                    dimension: 'none',
                    timeframe: { start: dayFromNow(1), end: dayFromNow(2) }
                });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'proxy',
                    series: [
                        {
                            days: [{ day: dayFromNow(1), value: 11 }]
                        }
                    ]
                });
            });

            it('function_executions broken down by function_type', async () => {
                const res = await clickhouse.getDailyCounter({
                    accountId,
                    metric: 'function_executions',
                    dimension: 'function_type',
                    timeframe: { start, end }
                });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'function_executions',
                    series: [
                        {
                            dimension: 'function_type',
                            dimensionValue: 'action',
                            days: [{ day: dayFromNow(1), value: 1 }]
                        },
                        {
                            dimension: 'function_type',
                            dimensionValue: 'sync',
                            days: [
                                { day: dayFromNow(), value: 1 },
                                { day: dayFromNow(1), value: 1 }
                            ]
                        },
                        {
                            dimension: 'function_type',
                            dimensionValue: 'webhook',
                            days: [{ day: dayFromNow(1), value: 1 }]
                        }
                    ]
                });
            });

            it('function_logs and function_compute_gbms expose their per-metric quantity', async () => {
                const logs = await clickhouse.getDailyCounter({ accountId, metric: 'function_logs', dimension: 'none', timeframe: { start, end } });
                expect(logs.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'function_logs',
                    series: [
                        {
                            days: [
                                { day: dayFromNow(), value: 10 },
                                { day: dayFromNow(1), value: 120 }
                            ]
                        }
                    ]
                });

                const compute = await clickhouse.getDailyCounter({
                    accountId,
                    metric: 'function_compute_gbms',
                    dimension: 'none',
                    timeframe: { start, end }
                });
                expect(compute.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'function_compute_gbms',
                    series: [
                        {
                            days: [
                                { day: dayFromNow(), value: 30 },
                                { day: dayFromNow(1), value: 3250 }
                            ]
                        }
                    ]
                });
            });

            it('webhook_forwards aggregates per-day successes and failures', async () => {
                const res = await clickhouse.getDailyCounter({ accountId, metric: 'webhook_forwards', dimension: 'none', timeframe: { start, end } });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'webhook_forwards',
                    series: [
                        {
                            days: [
                                { day: dayFromNow(), value: 6 },
                                { day: dayFromNow(1), value: 3 }
                            ]
                        }
                    ]
                });
            });
        });

        // Per-day (sum, batches) shape for AVG-style metrics. The running-period-average
        // + delta math that turns this into Orb's `view_mode='cumulative'` wire shape
        // lives in the server-side formatter (separate ticket); this method only
        // exposes the two accumulators the formatter needs.
        //
        // For the dimension breakdown, `batches` is the GLOBAL per-day batch count
        // (same for every dim value) so per-dim running averages are additive to
        // the no-dim global running average — see method docstring for rationale.
        //
        // Fixture recap (account 1):
        //   day 0 records: value=1000 (int=a), 1100 (int=a), 500 (int=b)
        //                  → sum=2600, 3 distinct batches global
        //                    per-int=a: sum=2100, per-int=b: sum=500; batches=3 for both
        //   day 1 records: value=1100 (int=a), 500 (int=b)
        //                  → sum=1600, 2 distinct batches global
        //                    per-int=a: sum=1100, per-int=b: sum=500; batches=2 for both
        //   day 0 connections: value=50, 60, 100 (each its own batch)
        //                  → sum=210, batches=3
        //   day 1 connections: value=20, 10, 0
        //                  → sum=30,  batches=3
        describe('getDailySumAndBatches', () => {
            it('records, no dimension', async () => {
                const res = await clickhouse.getDailySumAndBatches({
                    accountId,
                    metric: 'records',
                    dimension: 'none',
                    timeframe: { start, end }
                });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'records',
                    series: [
                        {
                            days: [
                                { day: dayFromNow(), sum: 2600, batches: 3 },
                                { day: dayFromNow(1), sum: 1600, batches: 2 }
                            ]
                        }
                    ]
                });
            });

            it('records, broken down by integration_id — batches is global per-day (additive to no-dim)', async () => {
                const res = await clickhouse.getDailySumAndBatches({
                    accountId,
                    metric: 'records',
                    dimension: 'integration_id',
                    timeframe: { start, end }
                });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'records',
                    series: [
                        {
                            dimension: 'integration_id',
                            dimensionValue: 'a',
                            days: [
                                { day: dayFromNow(), sum: 2100, batches: 3 },
                                { day: dayFromNow(1), sum: 1100, batches: 2 }
                            ]
                        },
                        {
                            dimension: 'integration_id',
                            dimensionValue: 'b',
                            days: [
                                { day: dayFromNow(), sum: 500, batches: 3 },
                                { day: dayFromNow(1), sum: 500, batches: 2 }
                            ]
                        }
                    ]
                });
            });

            it('connections, no dimension', async () => {
                const res = await clickhouse.getDailySumAndBatches({
                    accountId,
                    metric: 'connections',
                    dimension: 'none',
                    timeframe: { start, end }
                });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'connections',
                    series: [
                        {
                            days: [
                                { day: dayFromNow(), sum: 210, batches: 3 },
                                { day: dayFromNow(1), sum: 30, batches: 3 }
                            ]
                        }
                    ]
                });
            });

            it('excludes events outside the timeframe and from other accounts', async () => {
                const res = await clickhouse.getDailySumAndBatches({
                    accountId,
                    metric: 'records',
                    dimension: 'none',
                    timeframe: { start: dayFromNow(1), end: dayFromNow(2) }
                });
                expect(res.unwrap()).toStrictEqual({
                    accountId,
                    metric: 'records',
                    series: [
                        {
                            days: [{ day: dayFromNow(1), sum: 1600, batches: 2 }]
                        }
                    ]
                });
            });
        });
    });

    // A dim that has events on day 0 but none on day 1 must still appear on
    // day 1 in the breakdown response, with sum=0 and batches=global(day 1).
    // That's what keeps per-dim running averages additive to the no-dim global:
    // the dim's denominator must grow with the global on every day, even when
    // its numerator stays put. Without zero-fill, an inactive dim's running-avg
    // stays inflated past the point where it stopped contributing.
    describe('getDailySumAndBatches, dim inactive on later days', () => {
        const accountId = 42;
        const start = dayFromNow();
        const end = dayFromNow(7);

        beforeAll(async () => {
            await cleanup();
            clickhouse.addRaw([
                // day 0: int=a (sum=300, 2 batches), int=b (sum=100, 1 batch). 3 batches global.
                genEvent({ date: dayFromNow(0), type: 'usage.records', accountId, value: 200, attributes: { integrationId: 'a' } }),
                genEvent({ date: dayFromNow(0), type: 'usage.records', accountId, value: 100, attributes: { integrationId: 'a' } }),
                genEvent({ date: dayFromNow(0), type: 'usage.records', accountId, value: 100, attributes: { integrationId: 'b' } }),
                // day 1: only int=a (sum=200, 1 batch). int=b absent. 1 batch global.
                genEvent({ date: dayFromNow(1), type: 'usage.records', accountId, value: 200, attributes: { integrationId: 'a' } })
            ]);
            await clickhouse.flush();
        });

        it('zero-fills the inactive dim on day 1 with batches=global(day 1)', async () => {
            const res = await clickhouse.getDailySumAndBatches({
                accountId,
                metric: 'records',
                dimension: 'integration_id',
                timeframe: { start, end }
            });
            expect(res.unwrap()).toStrictEqual({
                accountId,
                metric: 'records',
                series: [
                    {
                        dimension: 'integration_id',
                        dimensionValue: 'a',
                        days: [
                            { day: dayFromNow(), sum: 300, batches: 3 },
                            { day: dayFromNow(1), sum: 200, batches: 1 }
                        ]
                    },
                    {
                        dimension: 'integration_id',
                        dimensionValue: 'b',
                        days: [
                            { day: dayFromNow(), sum: 100, batches: 3 },
                            // Zero-fill: int=b had no rows on day 1 but still
                            // carries day-1 global batches so its running-avg
                            // denominator grows with the global.
                            { day: dayFromNow(1), sum: 0, batches: 1 }
                        ]
                    }
                ]
            });
        });

        it('per-dim sums and running-avg are additive to the no-dim global at every day', async () => {
            const dimRes = await clickhouse.getDailySumAndBatches({
                accountId,
                metric: 'records',
                dimension: 'integration_id',
                timeframe: { start, end }
            });
            const globalRes = await clickhouse.getDailySumAndBatches({
                accountId,
                metric: 'records',
                dimension: 'none',
                timeframe: { start, end }
            });
            const dim = dimRes.unwrap().series;
            const global = globalRes.unwrap().series[0]!;
            // 'days' guaranteed to be present on every series after zero-fill.
            const globalDays = 'days' in global ? global.days : [];
            for (let i = 0; i < globalDays.length; i++) {
                const dimSum = dim.reduce((acc, s) => acc + s.days[i]!.sum, 0);
                expect(dimSum).toBe(globalDays[i]!.sum);
                // batches is global per-day across all dim series and the no-dim global.
                for (const s of dim) {
                    expect(s.days[i]!.batches).toBe(globalDays[i]!.batches);
                }
            }
        });
    });

    // Verifies the CH-platform contract we depend on: an insert with a stable
    // insert_deduplication_token is rejected by the server when re-sent, so retried
    // batches don't double-write raw_events.
    //
    // What we DON'T verify here: MV propagation via deduplicate_blocks_in_dependent_materialized_views.
    // That setting only takes effect for Replicated/Shared engines, which the local CH
    // testcontainer cannot provide (it runs plain ReplacingMergeTree / SummingMergeTree).
    // The full retry-safety contract — including MV propagation — was verified manually
    // against CH Cloud, see Linear doc:
    // https://linear.app/nango/document/avg-billing-metric-issues-7831f496d326
    describe('insert_deduplication_token contract', () => {
        const dedupDatabase = `usage_dedup_test`;

        beforeAll(async () => {
            const client = clickhouseClient();
            await client?.command({ query: `DROP DATABASE IF EXISTS ${dedupDatabase}` });
            await client?.close();
            await migrate({ database: dedupDatabase });

            // Plain ReplacingMergeTree has block dedup disabled by default
            // (non_replicated_deduplication_window=0). CH Cloud's SharedReplacingMergeTree
            // has it enabled. Enable it here so the tests exercise real dedup; otherwise
            // the assertions below would be vacuously true.
            const setupClient = clickhouseClient({ database: dedupDatabase });
            await setupClient?.command({
                query: `ALTER TABLE ${dedupDatabase}.raw_events MODIFY SETTING non_replicated_deduplication_window = 100`
            });
            await setupClient?.close();
        });

        it('dedupes identical INSERTs with the same token at raw_events level', async () => {
            const client = clickhouseClient({ database: dedupDatabase });
            if (!client) throw new Error('CLICKHOUSE_URL not set');

            const token = `dedup-token-${rnd.string()}`;
            const accountId = -999;
            const event = {
                ts: dayFromNow(0).getTime(),
                idempotency_key: rnd.string(),
                type: 'usage.proxy' as const,
                account_id: accountId,
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

            // count() (no FINAL) reflects what physically landed: server-side block dedup
            // should reject inserts 2 and 3 before they reach storage. FINAL would also
            // return 1 via ReplacingMergeTree, hiding a regression where dedup is off.
            const result = await client.query({
                query: `SELECT count() AS total FROM ${dedupDatabase}.raw_events WHERE account_id = ${accountId}`,
                format: 'JSONEachRow'
            });
            const rows = await result.json<{ total: string }>();
            expect(Number(rows[0]?.total)).toBe(1);

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

            // Identical rows on purpose: with parent dedup enabled, if token dedup ever
            // stopped working the identical block would collapse via block-hash dedup and
            // the assertion would fail — catching the regression. Varying the row content
            // would let the test pass even with broken tokens.
            for (let i = 0; i < 3; i++) {
                await client.insert({
                    table: 'raw_events',
                    values: [event],
                    format: 'JSONEachRow',
                    clickhouse_settings: { insert_deduplication_token: `distinct-token-${rnd.string()}` }
                });
            }

            const result = await client.query({
                query: `SELECT count() AS total FROM ${dedupDatabase}.raw_events WHERE account_id = ${accountId}`,
                format: 'JSONEachRow'
            });
            const rows = await result.json<{ total: string }>();
            expect(Number(rows[0]?.total)).toBe(3);

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
    },
    uuid: () => uuidv7()
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
                    batchId: rnd.uuid(),
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
                    batchId: rnd.uuid(),
                    ...attributes
                }
            };

        default:
            throw new Error(`Unsupported event type ${type}`);
    }
}
