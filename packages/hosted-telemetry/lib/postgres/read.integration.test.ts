import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureDailyPartitions } from '@nangohq/migrations';

import { migrate } from './migrate.js';
import { readMetricPages } from './read.js';
import { HOSTED_TELEMETRY_TABLE } from './schema.js';

import type { MetricRow } from '../exporter.js';
import type { Knex } from 'knex';

const schema = 'hosted_telemetry_read_test';
const day = new Date('2026-10-01T00:00:00Z');
const minute = (n: number) => new Date(day.getTime() + n * 60_000);
const DAY_MINUTES = 24 * 60;

let knex: Knex;

async function pages(from: Date, to: Date): Promise<MetricRow[][]> {
    const read: MetricRow[][] = [];
    for await (const page of readMetricPages(knex, { from, to, schema })) {
        read.push(page);
    }
    return read;
}

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    (await migrate({ knex, schema })).unwrap();
    (await ensureDailyPartitions({ knex, schema, table: HOSTED_TELEMETRY_TABLE, dates: [day, minute(DAY_MINUTES)] })).unwrap();

    await knex.raw(
        `INSERT INTO ??.?? (ts, metric, attributes, value)
         SELECT ?::timestamptz + n * interval '1 minute', metric, jsonb_build_object('environment_id', environment_id), n
         FROM generate_series(0, ? - 1) AS n, unnest(ARRAY['a.count', 'b.max']) AS metric, generate_series(1, 2) AS environment_id`,
        [schema, HOSTED_TELEMETRY_TABLE, day.toISOString(), 2 * DAY_MINUTES]
    );
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('readMetricPages', () => {
    it('reads every row of the range once, in key order, across pages', async () => {
        const read = await pages(day, minute(2 * DAY_MINUTES));
        const rows = read.flat();

        expect(read.map((page) => page.length)).toEqual([10_000, 1520]);
        const keys = rows.map((row) => `${row.metric} ${row.ts.toISOString()} ${JSON.stringify(row.attributes)}`);
        expect(new Set(keys).size).toBe(2 * DAY_MINUTES * 4);
        expect(keys).toEqual([...keys].sort());
        expect(rows[0]).toEqual({ ts: day, metric: 'a.count', attributes: { environment_id: 1 }, value: 0 });
        expect(rows.at(-1)).toEqual({ ts: minute(2 * DAY_MINUTES - 1), metric: 'b.max', attributes: { environment_id: 2 }, value: 2 * DAY_MINUTES - 1 });
    });

    it('includes from and excludes to', async () => {
        const rows = (await pages(minute(10), minute(12))).flat();

        expect(rows).toHaveLength(8);
        expect(new Set(rows.map((row) => row.ts.toISOString()))).toEqual(new Set([minute(10).toISOString(), minute(11).toISOString()]));
    });

    it('reads no page when the range has no rows', async () => {
        expect(await pages(minute(-60), day)).toEqual([]);
    });

    it('yields no empty page when the rows end exactly on a page', async () => {
        expect((await pages(day, minute(2500))).map((page) => page.length)).toEqual([10_000]);
    });
});
