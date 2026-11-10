import { randomUUID } from 'node:crypto';

import { createClient } from '@clickhouse/client';
import tracer from 'dd-trace';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { installationsClickhouseClient } from './clickhouse.js';
import { insertMetricsBatch } from './metrics.js';
import { migrate } from './migrate.js';

import type { ClickHouseClient } from '@clickhouse/client';

const database = 'installations_metrics_test';

let admin: ClickHouseClient;
let client: ClickHouseClient;

interface StoredRow {
    installation_id: string;
    ts: string;
    metric: string;
    attributes: string;
    value: number;
}

async function stored(installationId: string): Promise<StoredRow[]> {
    const res = await admin.query({
        query: `SELECT installation_id, ts, metric, attributes, value FROM {db:Identifier}.metrics FINAL WHERE installation_id = {id:UUID} ORDER BY metric, ts, attributes`,
        format: 'JSONEachRow',
        query_params: { db: database, id: installationId }
    });
    return res.json<StoredRow>();
}

beforeAll(async () => {
    const url = process.env['CLICKHOUSE_URL']!;
    admin = createClient({ url });
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    (await migrate({ clickhouseUrl: url, database })).unwrap();
    client = installationsClickhouseClient(url, { database });
});

afterAll(async () => {
    await client.close();
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    await admin.close();
});

afterEach(() => {
    vi.restoreAllMocks();
});

function observed() {
    const span = { addTags: vi.fn(), setTag: vi.fn() };
    vi.spyOn(tracer, 'trace').mockImplementation(((_name: string, fn: (span: unknown) => unknown) => fn(span)) as typeof tracer.trace);
    const distribution = vi.spyOn(tracer.dogstatsd, 'distribution');
    return { span, measured: () => distribution.mock.calls.map(([name, value, tags]) => [name, typeof value, tags]) };
}

const day = (minute: number) => new Date(Date.UTC(2026, 10, 8, 0, minute));

describe('insertMetricsBatch', () => {
    it('stores a batch under the installation it was stamped with', async () => {
        const installationId = randomUUID();

        const res = await insertMetricsBatch(client, {
            installationId,
            rows: [
                { ts: day(0), metric: 'nango.hosted_metric.active_concurrency.max', attributes: '{"environment":"prod"}', value: 3 },
                { ts: day(1), metric: 'nango.hosted_metric.active_concurrency.max', attributes: '{"environment":"prod"}', value: 5 }
            ]
        });

        expect(res.isOk()).toBe(true);
        expect(await stored(installationId)).toEqual([
            {
                installation_id: installationId,
                ts: '2026-11-08 00:00:00.000',
                metric: 'nango.hosted_metric.active_concurrency.max',
                attributes: '{"environment":"prod"}',
                value: 3
            },
            {
                installation_id: installationId,
                ts: '2026-11-08 00:01:00.000',
                metric: 'nango.hosted_metric.active_concurrency.max',
                attributes: '{"environment":"prod"}',
                value: 5
            }
        ]);
    });

    it('a replayed batch leaves one copy of each row, the latest one', async () => {
        const installationId = randomUUID();
        const rows = [
            { ts: day(0), metric: 'nango.hosted_metric.connections.count', attributes: '{}', value: 10 },
            { ts: day(0), metric: 'nango.hosted_metric.connections.count', attributes: '{"environment":"prod"}', value: 7 }
        ];

        (await insertMetricsBatch(client, { installationId, rows })).unwrap();
        (await insertMetricsBatch(client, { installationId, rows: rows.map((row) => ({ ...row, value: row.value + 1 })) })).unwrap();

        expect((await stored(installationId)).map((r) => [r.attributes, r.value])).toEqual([
            ['{"environment":"prod"}', 8],
            ['{}', 11]
        ]);
    });

    it('keeps the rows of other installations apart', async () => {
        const one = randomUUID();
        const other = randomUUID();
        const row = { ts: day(0), metric: 'nango.hosted_metric.connections.count', attributes: '{}', value: 1 };

        (await insertMetricsBatch(client, { installationId: one, rows: [row] })).unwrap();
        (await insertMetricsBatch(client, { installationId: other, rows: [{ ...row, value: 2 }] })).unwrap();

        expect((await stored(one)).map((r) => r.value)).toEqual([1]);
        expect((await stored(other)).map((r) => r.value)).toEqual([2]);
    });

    it('measures a stored batch and tags its span with the installation and the rows', async () => {
        const installationId = randomUUID();
        const { span, measured } = observed();

        (await insertMetricsBatch(client, { installationId, rows: [{ ts: day(0), metric: 'm', attributes: '{}', value: 1 }] })).unwrap();

        expect(span.addTags).toHaveBeenCalledExactlyOnceWith({ 'nango.installationId': installationId, rows: 1 });
        expect(span.setTag).not.toHaveBeenCalled();
        expect(measured()).toEqual([
            [metrics.Types.SELF_HOSTING_CLICKHOUSE_INSERT_DURATION_MS, 'number', { success: 'true' }],
            [metrics.Types.SELF_HOSTING_CLICKHOUSE_INSERT_ROWS, 'number', {}]
        ]);
    });

    it('an empty batch writes nothing and succeeds', async () => {
        expect((await insertMetricsBatch(client, { installationId: randomUUID(), rows: [] })).isOk()).toBe(true);
    });

    it('returns the error when ClickHouse rejects the batch', async () => {
        const broken = installationsClickhouseClient(process.env['CLICKHOUSE_URL']!, { database: 'installations_metrics_test_nowhere' });
        try {
            const { span, measured } = observed();

            const res = await insertMetricsBatch(broken, { installationId: randomUUID(), rows: [{ ts: day(0), metric: 'm', attributes: '{}', value: 1 }] });

            expect(res.isErr()).toBe(true);
            expect(span.setTag).toHaveBeenCalledExactlyOnceWith('error', res.isErr() && res.error);
            expect(measured()).toEqual([[metrics.Types.SELF_HOSTING_CLICKHOUSE_INSERT_DURATION_MS, 'number', { success: 'false' }]]);
        } finally {
            await broken.close();
        }
    });
});
