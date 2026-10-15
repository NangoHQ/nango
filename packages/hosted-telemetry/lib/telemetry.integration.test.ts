import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresMetricExporter } from './exporter.js';
import { migrate } from './postgres/migrate.js';
import { ensurePartitions } from './postgres/partitions.js';
import { HOSTED_TELEMETRY_TABLE } from './postgres/schema.js';
import { createHostedTelemetry, producerId } from './telemetry.js';

import type { Knex } from 'knex';

const schema = 'hosted_telemetry_provider_test';
const exportIntervalMs = 3_600_000;

let knex: Knex;

interface Row {
    ts: Date;
    metric: string;
    attributes: Record<string, string | number>;
    value: number;
}

async function rows(): Promise<Row[]> {
    const { rows } = await knex.raw<{ rows: Row[] }>('SELECT ts, metric, attributes, value FROM ??.?? ORDER BY ts, metric, attributes', [
        schema,
        HOSTED_TELEMETRY_TABLE
    ]);
    return rows;
}

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    (await migrate({ knex, schema })).unwrap();
    const now = new Date();
    (await ensurePartitions({ knex, schema, dates: [now, new Date(now.getTime() + 86_400_000)] })).unwrap();
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('hosted telemetry producer', () => {
    it('is a no-op without a store', async () => {
        const telemetry = createHostedTelemetry();
        telemetry.increment('nango.hosted_metric.active_concurrency', 1, { environment_id: 7 });
        await expect(telemetry.shutdown()).resolves.toBeUndefined();
        expect(await rows()).toEqual([]);
    });

    it('writes the aggregation of each metric since the last export, stamped with the producer and when it started', async () => {
        const before = Date.now();
        const telemetry = createHostedTelemetry({ knex, schema, exportIntervalMs });
        telemetry.increment('nango.hosted_metric.active_concurrency', 2, { environment_id: 7 });
        telemetry.increment('nango.hosted_metric.active_concurrency', 3, { environment_id: 7 });
        for (const sample of [7, 12, 14]) {
            telemetry.histogram('nango.hosted_metric.active_concurrency', sample, { environment_id: 8 });
        }
        telemetry.gauge('nango.hosted_metric.active_concurrency', 1283, { account_id: 3, environment_id: 9, integration_id: 'hubspot' });

        await telemetry.shutdown();

        const producer = producerId();
        const written = await rows();
        for (const row of written) {
            expect(row.ts.getTime()).toBeGreaterThanOrEqual(before);
            expect(row.ts.getTime()).toBeLessThanOrEqual(Date.now());
        }
        expect(written.map(({ ts: _, ...row }) => row).sort((a, b) => a.metric.localeCompare(b.metric))).toEqual([
            { metric: 'nango.hosted_metric.active_concurrency', attributes: { environment_id: 7, producer_id: producer }, value: 5 },
            {
                metric: 'nango.hosted_metric.active_concurrency',
                attributes: { account_id: 3, environment_id: 9, integration_id: 'hubspot', producer_id: producer },
                value: 1283
            },
            { metric: 'nango.hosted_metric.active_concurrency.count', attributes: { environment_id: 8, producer_id: producer }, value: 3 },
            { metric: 'nango.hosted_metric.active_concurrency.max', attributes: { environment_id: 8, producer_id: producer }, value: 14 },
            { metric: 'nango.hosted_metric.active_concurrency.min', attributes: { environment_id: 8, producer_id: producer }, value: 7 },
            { metric: 'nango.hosted_metric.active_concurrency.sum', attributes: { environment_id: 8, producer_id: producer }, value: 33 }
        ]);
    });

    it('keeps both rows when one producer exports twice', async () => {
        await knex.raw('TRUNCATE ??.??', [schema, HOSTED_TELEMETRY_TABLE]);
        const first = createHostedTelemetry({ knex, schema, exportIntervalMs });
        first.increment('nango.hosted_metric.active_concurrency', 2, { environment_id: 7 });
        await first.shutdown();
        const second = createHostedTelemetry({ knex, schema, exportIntervalMs });
        second.increment('nango.hosted_metric.active_concurrency', 4, { environment_id: 7 });
        await second.shutdown();

        expect((await rows()).map((r) => r.value)).toEqual([2, 4]);
    });

    it('rewrites the same rows when an export is retried', async () => {
        await knex.raw('TRUNCATE ??.??', [schema, HOSTED_TELEMETRY_TABLE]);
        const exporter = new PostgresMetricExporter({ knex, schema });
        const row = { ts: new Date(), metric: 'nango.hosted_metric.active_concurrency', attributes: { environment_id: 7, producer_id: 'pod-a' }, value: 9 };
        await exporter.write([row]);
        await exporter.write([row]);

        expect(await rows()).toEqual([row]);
    });
});
