import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate } from './postgres/migrate.js';
import { ensurePartitions } from './postgres/partitions.js';
import { HOSTED_TELEMETRY_TABLE } from './postgres/schema.js';
import { createHostedTelemetry, hostedTelemetry, producerId } from './telemetry.js';

import type { Knex } from 'knex';

const schema = 'hosted_telemetry_provider_test';
const windowMs = 3_600_000;

let knex: Knex;

interface Row {
    metric: string;
    attributes: Record<string, string | number>;
    value: number;
    aligned: boolean;
}

async function rows(): Promise<Row[]> {
    const { rows } = await knex.raw<{ rows: Row[] }>(
        `SELECT metric, attributes, value, (extract(epoch FROM ts)::bigint % ?) = 0 AS aligned FROM ??.?? ORDER BY metric, attributes`,
        [windowMs / 1000, schema, HOSTED_TELEMETRY_TABLE]
    );
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
    it('is a no-op on an installation that has not turned it on', async () => {
        hostedTelemetry.createCounter('nango.hosted_metric.active_concurrency').add(1, { environment_id: 7 });
        expect(await rows()).toEqual([]);
    });

    it('writes the aggregation of each metric for the window, stamped with the producer and the window', async () => {
        const telemetry = createHostedTelemetry({ knex, schema, exportIntervalMs: windowMs });
        const counter = telemetry.createCounter('nango.hosted_metric.active_concurrency');
        counter.add(2, { environment_id: 7 });
        counter.add(3, { environment_id: 7 });
        const histogram = telemetry.createHistogram('nango.hosted_metric.active_concurrency');
        for (const sample of [7, 12, 14]) {
            histogram.record(sample, { environment_id: 8 });
        }
        telemetry.createGauge('nango.hosted_metric.active_concurrency').record(1283, { account_id: 3, environment_id: 9, integration_id: 'hubspot' });

        await telemetry.shutdown();

        const producer = producerId();
        expect(await rows()).toEqual([
            { metric: 'nango.hosted_metric.active_concurrency', attributes: { environment_id: 7, producer_id: producer }, value: 5, aligned: true },
            {
                metric: 'nango.hosted_metric.active_concurrency',
                attributes: { account_id: 3, environment_id: 9, integration_id: 'hubspot', producer_id: producer },
                value: 1283,
                aligned: true
            },
            { metric: 'nango.hosted_metric.active_concurrency.count', attributes: { environment_id: 8, producer_id: producer }, value: 3, aligned: true },
            { metric: 'nango.hosted_metric.active_concurrency.max', attributes: { environment_id: 8, producer_id: producer }, value: 14, aligned: true },
            { metric: 'nango.hosted_metric.active_concurrency.min', attributes: { environment_id: 8, producer_id: producer }, value: 7, aligned: true },
            { metric: 'nango.hosted_metric.active_concurrency.sum', attributes: { environment_id: 8, producer_id: producer }, value: 33, aligned: true }
        ]);
    });

    it('replaces a window that is exported twice with the later export', async () => {
        const telemetry = createHostedTelemetry({ knex, schema, exportIntervalMs: windowMs });
        telemetry.createCounter('nango.hosted_metric.active_concurrency').add(4, { environment_id: 7 });
        await telemetry.shutdown();

        const counter = (await rows()).find((r) => r.metric === 'nango.hosted_metric.active_concurrency' && r.attributes['environment_id'] === 7);
        expect(counter?.value).toBe(4);
    });
});
