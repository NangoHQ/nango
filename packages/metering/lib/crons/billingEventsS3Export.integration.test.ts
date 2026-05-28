import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clickhouse, clickhouseClient, migrate } from '@nangohq/usage';

import { metricRowsSql, METRICS } from './billingEventsS3Export.js';

import type { MetricSpec } from './billingEventsS3Export.js';
import type { ClickhouseRawUsageEvent } from '@nangohq/usage';

const database = `billing_events_s3_export_test`;
const targetDay = '2026-05-06'; // events seeded here are what the export SQL should pick up
const otherDay = '2026-05-07'; // events seeded here must be excluded by WHERE day = ...

// ---------- fixture builders (declared first so per-metric fixture constants can reference them at module-load time) ----------

const baseAttributes = {
    environmentId: 1,
    environmentName: 'test',
    integrationId: 'test',
    connectionId: 'test'
};

// FixtureAttrs is intentionally permissive: ClickhouseRawUsageEventAttrs is a union
// and TS doesn't narrow object literals against union members the way we'd want for
// per-type fixture construction. The final ClickhouseRawUsageEvent shape is enforced
// per-branch inside `gen()`.
type FixtureAttrs = Record<string, unknown>;

function genN({
    n,
    day,
    type,
    accountId,
    attributes = {}
}: {
    n: number;
    day: string;
    type: ClickhouseRawUsageEvent['type'];
    accountId: number;
    attributes?: FixtureAttrs;
}): ClickhouseRawUsageEvent[] {
    return Array.from({ length: n }, () => gen({ day, type, accountId, attributes }));
}

function gen({
    day,
    type,
    accountId,
    value = 1,
    attributes = {}
}: {
    day: string;
    type: ClickhouseRawUsageEvent['type'];
    accountId: number;
    value?: number;
    attributes?: FixtureAttrs;
}): ClickhouseRawUsageEvent {
    const ts = new Date(`${day}T12:00:00.000Z`).getTime();
    const idempotency_key = Math.random().toString(36).slice(2);
    const built = ((): { type: ClickhouseRawUsageEvent['type']; attrs: Record<string, unknown> } => {
        switch (type) {
            case 'usage.proxy':
            case 'usage.webhook_forward':
                return { type, attrs: { success: true, ...baseAttributes, ...attributes } };
            case 'usage.function_executions':
                return {
                    type,
                    attrs: {
                        ...baseAttributes,
                        type: 'sync',
                        functionName: 'test',
                        success: true,
                        runtime: 'lambda',
                        telemetryBag: { durationMs: 1, customLogs: 1, proxyCalls: 1, memoryGb: 1 },
                        ...attributes
                    }
                };
            case 'usage.actions':
                return { type, attrs: { ...baseAttributes, actionName: 'test', ...attributes } };
            case 'usage.monthly_active_records':
                return { type, attrs: { ...baseAttributes, syncId: 'test', model: 'test', ...attributes } };
            case 'usage.records':
                return { type, attrs: { ...baseAttributes, model: 'test', syncId: 'test', ...attributes } };
            case 'usage.connections':
                return { type, attrs: { ...baseAttributes, ...attributes } };
            default:
                throw new Error(`unsupported event type ${type satisfies never}`);
        }
    })();
    return { ts, type: built.type, idempotency_key, account_id: accountId, value, attributes: built.attrs } as ClickhouseRawUsageEvent;
}

// ---------- per-metric fixtures ----------

const proxyFixtures: ClickhouseRawUsageEvent[] = [
    ...genN({ n: 5, day: targetDay, type: 'usage.proxy', accountId: 1 }),
    ...genN({ n: 7, day: targetDay, type: 'usage.proxy', accountId: 1 }),
    ...genN({ n: 2, day: targetDay, type: 'usage.proxy', accountId: 1, attributes: { environmentId: 2 } }),
    ...genN({ n: 3, day: targetDay, type: 'usage.proxy', accountId: 999 }),
    ...genN({ n: 100, day: otherDay, type: 'usage.proxy', accountId: 1 })
];

const functionExecutionsFixtures: ClickhouseRawUsageEvent[] = genN({
    n: 4,
    day: targetDay,
    type: 'usage.function_executions',
    accountId: 1,
    // Each event: durationMs=100, customLogs=5, memoryGb=2 → compute_gbms = duration_ms × memoryGb = 200.
    attributes: { telemetryBag: { durationMs: 100, customLogs: 5, proxyCalls: 1, memoryGb: 2 } }
});

const webhookForwardsFixtures: ClickhouseRawUsageEvent[] = genN({ n: 8, day: targetDay, type: 'usage.webhook_forward', accountId: 1 });

const billableActionsFixtures: ClickhouseRawUsageEvent[] = genN({
    n: 2,
    day: targetDay,
    type: 'usage.actions',
    accountId: 1,
    attributes: { actionName: 'doThing' }
});

const marFixtures: ClickhouseRawUsageEvent[] = genN({
    n: 3,
    day: targetDay,
    type: 'usage.monthly_active_records',
    accountId: 1,
    attributes: { syncId: 's1', model: 'm1' }
});

// records: two batches, each with two slices (different integration_id).
// Per-batch sum: B1 = 100+200 = 300, B2 = 50+150 = 200.
// Cross-batch average: AVG(300, 200) = 250.
const recordsBatch1 = '00000000-0000-0000-0000-000000000001';
const recordsBatch2 = '00000000-0000-0000-0000-000000000002';
const recordsFixtures: ClickhouseRawUsageEvent[] = [
    gen({
        day: targetDay,
        type: 'usage.records',
        accountId: 1,
        value: 100,
        attributes: { integrationId: 'a', syncId: 's1', model: 'm1', batchId: recordsBatch1 }
    }),
    gen({
        day: targetDay,
        type: 'usage.records',
        accountId: 1,
        value: 200,
        attributes: { integrationId: 'b', syncId: 's1', model: 'm1', batchId: recordsBatch1 }
    }),
    gen({
        day: targetDay,
        type: 'usage.records',
        accountId: 1,
        value: 50,
        attributes: { integrationId: 'a', syncId: 's1', model: 'm1', batchId: recordsBatch2 }
    }),
    gen({
        day: targetDay,
        type: 'usage.records',
        accountId: 1,
        value: 150,
        attributes: { integrationId: 'b', syncId: 's1', model: 'm1', batchId: recordsBatch2 }
    })
];

// connections: same pattern. Per-batch sum: B1 = 10+20 = 30, B2 = 5+15 = 20.
// Cross-batch average: AVG(30, 20) = 25.
const connectionsBatch1 = '00000000-0000-0000-0000-000000000003';
const connectionsBatch2 = '00000000-0000-0000-0000-000000000004';
const connectionsFixtures: ClickhouseRawUsageEvent[] = [
    gen({ day: targetDay, type: 'usage.connections', accountId: 1, value: 10, attributes: { integrationId: 'a', batchId: connectionsBatch1 } }),
    gen({ day: targetDay, type: 'usage.connections', accountId: 1, value: 20, attributes: { integrationId: 'b', batchId: connectionsBatch1 } }),
    gen({ day: targetDay, type: 'usage.connections', accountId: 1, value: 5, attributes: { integrationId: 'a', batchId: connectionsBatch2 } }),
    gen({ day: targetDay, type: 'usage.connections', accountId: 1, value: 15, attributes: { integrationId: 'b', batchId: connectionsBatch2 } })
];

// ---------- tests ----------

describe('billingEventsS3Export', () => {
    const clickhouse = new Clickhouse({ database });

    afterAll(async () => {
        await clickhouse.shutdown();
    });

    beforeAll(async () => {
        await resetDatabase();
        clickhouse.addRaw([
            ...proxyFixtures,
            ...functionExecutionsFixtures,
            ...webhookForwardsFixtures,
            ...billableActionsFixtures,
            ...marFixtures,
            ...recordsFixtures,
            ...connectionsFixtures
        ]);
        await clickhouse.flush();
    });

    // Counter (`SummingMergeTree(value)` source). Account 1 has 5+7 events in env=1 plus
    // 2 events in env=2 = 14 total — verifies aggregation collapses to (account, day),
    // not (account, env, day). Account 999 has 3 events. 100 events on otherDay are excluded.
    describe('proxy', () => {
        it('emits one row per (account, day) with summed counts', async () => {
            const rows = await runQuery('proxy', 'proxy_test');

            expect(rows).toHaveLength(2);
            expect(rows).toContainEqual({
                idempotency_key: `proxy_test:1:${targetDay}`,
                event_name: 'proxy_test',
                external_customer_id: '1',
                timestamp: `${targetDay}T23:59:59.999Z`,
                properties: { count: 14 }
            });
            expect(rows).toContainEqual({
                idempotency_key: `proxy_test:999:${targetDay}`,
                event_name: 'proxy_test',
                external_customer_id: '999',
                timestamp: `${targetDay}T23:59:59.999Z`,
                properties: { count: 3 }
            });
        });
    });

    // Counter with extra telemetry properties. Account 1 has 4 events, each with
    // duration_ms=100, custom_logs=5, memoryGb=2 → count=4, durationMs=400,
    // customLogs=20, compute=4*100*2=800.
    describe('function_executions', () => {
        it('carries count + telemetry properties', async () => {
            const rows = await runQuery('function_executions', 'function_executions_test');

            expect(rows).toHaveLength(1);
            expect(rows[0]!).toEqual({
                idempotency_key: `function_executions_test:1:${targetDay}`,
                event_name: 'function_executions_test',
                external_customer_id: '1',
                timestamp: `${targetDay}T23:59:59.999Z`,
                properties: {
                    count: 4,
                    'telemetry.durationMs': 400,
                    'telemetry.customLogs': 20,
                    'telemetry.compute': 800
                }
            });
        });
    });

    // Counter. Account 1 has 8 events.
    describe('webhook_forwards', () => {
        it('emits summed counts', async () => {
            const rows = await runQuery('webhook_forwards', 'webhook_forwards_test');
            expect(rows).toHaveLength(1);
            expect(rows[0]!.properties).toEqual({ count: 8 });
        });
    });

    // Counter. Account 1 has 2 events.
    describe('billable_actions', () => {
        it('emits summed counts', async () => {
            const rows = await runQuery('billable_actions', 'billable_actions_test');
            expect(rows).toHaveLength(1);
            expect(rows[0]!.properties).toEqual({ count: 2 });
        });
    });

    // Counter. Account 1 has 3 events.
    describe('monthly_active_records', () => {
        it('emits summed counts', async () => {
            const rows = await runQuery('monthly_active_records', 'monthly_active_records_test');
            expect(rows).toHaveLength(1);
            expect(rows[0]!.properties).toEqual({ count: 3 });
        });
    });

    // Typed projection (`daily_raw_records`). Two batches × two slices each:
    //   B1: integration a=100 + b=200 → batch_val=300
    //   B2: integration a=50  + b=150 → batch_val=200
    // → AVG(300, 200) = 250. Matches Orb's average(count) semantic.
    describe('records', () => {
        it('emits sum-across-slices-per-batch then average-across-batches', async () => {
            const rows = await runQuery('records', 'records_test');
            expect(rows).toHaveLength(1);
            expect(rows[0]!.properties).toEqual({ count: 250 });
        });
    });

    // Same pattern from `daily_raw_connections`:
    //   B1: a=10 + b=20 → batch_val=30
    //   B2: a=5  + b=15 → batch_val=20
    // → AVG(30, 20) = 25.
    describe('billable_connections_v2', () => {
        it('emits sum-across-slices-per-batch then average-across-batches', async () => {
            const rows = await runQuery('billable_connections_v2', 'billable_connections_v2_test');
            expect(rows).toHaveLength(1);
            expect(rows[0]!.properties).toEqual({ count: 25 });
        });
    });

    // Cross-cutting checks that exercise behaviour shared by every metric.
    it('threads event_name suffix into idempotency_key and event_name', async () => {
        const rows = await runQuery('proxy', 'proxy');
        expect(rows.find((r: { external_customer_id: string }) => r.external_customer_id === '1')).toMatchObject({
            idempotency_key: `proxy:1:${targetDay}`,
            event_name: 'proxy'
        });
    });

    it('excludes rows for other days via WHERE day = ...', async () => {
        const metric = METRICS.find((m) => m.canonicalEventName === 'proxy');
        if (!metric) throw new Error('proxy metric missing');
        const sql = metricRowsSql({ metric, day: '2030-01-01', eventName: 'proxy', database });
        const c = clickhouseClient();
        if (!c) throw new Error('client not configured');
        try {
            const result = await c.query({ query: sql, format: 'JSONEachRow' });
            const rows = await result.json();
            expect(rows).toHaveLength(0);
        } finally {
            await c.close();
        }
    });
});

// ---------- shared infra ----------

async function resetDatabase(): Promise<void> {
    const c = clickhouseClient();
    if (!c) throw new Error('CLICKHOUSE_URL not set; integration tests require a running ClickHouse');
    try {
        await c.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    } finally {
        await c.close();
    }
    await migrate({ database });
}

interface OrbRow {
    idempotency_key: string;
    event_name: string;
    external_customer_id: string;
    timestamp: string;
    properties: Record<string, number>;
}

async function runQuery(canonicalEventName: string, eventName: string): Promise<OrbRow[]> {
    const metric: MetricSpec | undefined = METRICS.find((m) => m.canonicalEventName === canonicalEventName);
    if (!metric) throw new Error(`metric ${canonicalEventName} not in METRICS`);

    const sql = metricRowsSql({ metric, day: targetDay, eventName, database });
    const c = clickhouseClient();
    if (!c) throw new Error('CLICKHOUSE_URL not set');
    try {
        const result = await c.query({ query: sql, format: 'JSONEachRow' });
        return await result.json();
    } finally {
        await c.close();
    }
}
