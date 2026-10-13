import knexFactory from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { UsageTelemetryClient } from '../client.js';
import { migrate } from '../postgres/migrate.js';
import { ensurePartitions } from '../postgres/partitions.js';
import { USAGE_TELEMETRY_TABLE } from '../postgres/schema.js';
import { PostgresUsageStore } from './postgres.js';

import type { UsageAttributes, UsagePoint } from '../types.js';
import type { Knex } from 'knex';

const schema = 'usage_telemetry_store_test';
const env1: UsageAttributes = { environment_id: 1 };
const env2: UsageAttributes = { environment_id: 2 };

let knex: Knex;
let client: UsageTelemetryClient;

/** Everything stored, in a stable order. */
async function stored(): Promise<UsagePoint[]> {
    return await knex.withSchema(schema).from(USAGE_TELEMETRY_TABLE).select<UsagePoint[]>('metric', 'ts', 'attributes', 'value').orderBy(['ts', 'attributes']);
}

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 9, 12, 0, seconds));
const point = (attributes: UsageAttributes, seconds: number, value: number): UsagePoint => ({
    metric: 'nango.functions.active_concurrency.max',
    ts: at(seconds),
    attributes,
    value
});

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    expect((await migrate({ knex, schema })).isOk()).toBe(true);
    (await ensurePartitions({ knex, schema, dates: [at(0)] })).unwrap();
    client = new UsageTelemetryClient(new PostgresUsageStore(knex, schema));
});

beforeEach(async () => {
    await knex.raw('TRUNCATE ??.??', [schema, USAGE_TELEMETRY_TABLE]);
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('postgres usage telemetry store', () => {
    it('stores what it records', async () => {
        (await client.record([point(env1, 1, 4), point(env1, 0, 3.5), point(env2, 0, 7)])).unwrap();

        expect(await stored()).toEqual([point(env1, 0, 3.5), point(env2, 0, 7), point(env1, 1, 4)]);
    });

    it('keeps the first value when the same metric, ts and attributes is recorded again', async () => {
        (await client.record([point(env1, 0, 3)])).unwrap();
        (await client.record([point(env1, 0, 9), point(env1, 1, 4)])).unwrap();

        expect(await stored()).toEqual([point(env1, 0, 3), point(env1, 1, 4)]);
    });

    it('writes large batches', async () => {
        const points = Array.from({ length: 2500 }, (_, i) => point({ environment_id: i + 1 }, 0, i));
        (await client.record(points)).unwrap();

        expect(await stored()).toHaveLength(2500);
    });

    it('writes none of a batch when part of it fails', async () => {
        const outsidePartitions = { ...point(env2, 0, 1), ts: new Date('2020-01-01T00:00:00Z') };
        expect((await client.record([point(env1, 0, 1), outsidePartitions])).isErr()).toBe(true);

        expect(await stored()).toEqual([]);
    });
});
