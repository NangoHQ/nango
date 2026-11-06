import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureDailyPartitions } from '@nangohq/migrations';

import { migrate } from './migrate.js';
import { HOSTED_TELEMETRY_TABLE } from './schema.js';

import type { Knex } from 'knex';

const schema = 'hosted_telemetry_migrate_test';
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';
const PG_NOT_NULL_VIOLATION = '23502';

let knex: Knex;

const ts = new Date('2026-10-09T12:00:00Z');
const row = (overrides: Record<string, unknown> = {}) => ({
    ts,
    value: 3,
    metric: 'nango.hosted_metric.active_concurrency.max',
    attributes: { environment_id: 1 },
    ...overrides
});
const table = () => knex.withSchema(schema).table(HOSTED_TELEMETRY_TABLE);

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    expect((await migrate({ knex, schema })).isOk()).toBe(true);
    (await ensureDailyPartitions({ knex, schema, table: HOSTED_TELEMETRY_TABLE, dates: [ts] })).unwrap();
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('hosted telemetry postgres migrate', () => {
    it('creates the schema and applies only the hosted telemetry set', async () => {
        const applied = await knex.raw<{ rows: { name: string }[] }>(`SELECT name FROM ??.migrations ORDER BY name`, [schema]);
        expect(applied.rows.map((r) => r.name)).toEqual(['20261014000001_create_metrics']);
    });

    it('keeps one value per metric, ts and attributes, comparing attributes by value', async () => {
        await table().insert(row({ attributes: { environment_id: 1, connection_id: 25 } }));
        await expect(table().insert(row({ value: 9, attributes: { connection_id: 25, environment_id: 1 } }))).rejects.toMatchObject({
            code: PG_UNIQUE_VIOLATION
        });
        await table().insert(row({ attributes: { environment_id: 2 } }));
        await table().insert(row({ metric: 'nango.other' }));
        await knex.raw('TRUNCATE ??.??', [schema, HOSTED_TELEMETRY_TABLE]);
    });

    it('defaults attributes to an empty object, which is unique like any other', async () => {
        await table().insert({ ts, value: 1, metric: 'nango.no_attributes' });
        await expect(table().insert({ ts, value: 2, metric: 'nango.no_attributes' })).rejects.toMatchObject({ code: PG_UNIQUE_VIOLATION });
        await knex.raw('TRUNCATE ??.??', [schema, HOSTED_TELEMETRY_TABLE]);
    });

    it('refuses values that are not finite', async () => {
        for (const value of ['NaN', 'Infinity', '-Infinity']) {
            await expect(table().insert(row({ value }))).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
        }
    });

    it('refuses attributes too large to sit in the key', async () => {
        await expect(table().insert(row({ attributes: { environment_id: 1, note: 'x'.repeat(1024) } }))).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
        await table().insert(row({ attributes: { environment_id: 1, note: 'x'.repeat(900) } }));
        await knex.raw('TRUNCATE ??.??', [schema, HOSTED_TELEMETRY_TABLE]);
    });

    it('refuses null and non-object attributes', async () => {
        await expect(table().insert(row({ attributes: null }))).rejects.toMatchObject({ code: PG_NOT_NULL_VIOLATION });
        await expect(table().insert(row({ attributes: JSON.stringify(null) }))).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
        await expect(table().insert(row({ attributes: JSON.stringify([1]) }))).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
        await expect(table().insert(row({ attributes: JSON.stringify(7) }))).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
    });
});
