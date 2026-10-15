import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import knexFactory from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { dropExpiredDailyPartitions, ensureDailyPartitions } from './partitions.js';

import type { Knex } from 'knex';

dayjs.extend(utc);

const schema = 'partitions_test';
const foreignSchema = `${schema}_foreign`;
const table = 'events';
const name = (date: string) => `${table}_${date}`;

let knex: Knex;

async function partitions(): Promise<string[]> {
    const { rows } = await knex.raw<{ rows: { relname: string }[] }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ? AND c.relkind = 'r' AND c.relname ~ ? ORDER BY c.relname`,
        [schema, `^${table}_[0-9]{8}$`]
    );
    return rows.map((r) => r.relname);
}

/** What the daemon does on each tick, at a given time. */
async function tick(now: Date, retentionDays = 90): Promise<{ dropped: number; skipped: number }> {
    (await ensureDailyPartitions({ knex, schema, table, dates: [now, dayjs(now).utc().add(1, 'day').toDate()] })).unwrap();
    return (await dropExpiredDailyPartitions({ knex, schema, table, retentionDays, now })).unwrap();
}

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.raw('CREATE SCHEMA ??', [schema]);
    await knex.raw(`CREATE TABLE ??.?? (ts TIMESTAMPTZ NOT NULL, value INT NOT NULL) PARTITION BY RANGE (ts)`, [schema, table]);
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [foreignSchema]);
    await knex.destroy();
});

beforeEach(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [foreignSchema]);
    for (const partition of await partitions()) {
        await knex.raw('DROP TABLE IF EXISTS ??.??', [schema, partition]);
    }
});

describe('daily partition lifecycle', () => {
    it('creates today and tomorrow across the UTC year boundary, and is idempotent', async () => {
        await tick(new Date('2026-12-31T23:30:00Z'));
        expect(await partitions()).toEqual([name('20261231'), name('20270101')]);

        await tick(new Date('2026-12-31T23:30:00Z'));
        expect(await partitions()).toEqual([name('20261231'), name('20270101')]);
    });

    it('covers its whole day and neither of the neighbouring ones', async () => {
        (await ensureDailyPartitions({ knex, schema, table, dates: [new Date('2026-10-09T12:00:00Z')] })).unwrap();
        const insert = (ts: string) => knex.withSchema(schema).table(table).insert({ ts, value: 1 });
        await expect(insert('2026-10-09T00:00:00.000Z')).resolves.toBeDefined();
        await expect(insert('2026-10-09T23:59:59.999Z')).resolves.toBeDefined();
        await expect(insert('2026-10-08T23:59:59.999Z')).rejects.toThrow(/no partition of relation/);
        await expect(insert('2026-10-10T00:00:00.000Z')).rejects.toThrow(/no partition of relation/);
    });

    it('still ensures the other days when some cannot be created, and names every one that failed', async () => {
        const today = dayjs('2026-09-30T12:00:00Z').utc().startOf('day');
        const overlapping = `${table}_manual`;
        await knex.raw(`CREATE TABLE ??.?? PARTITION OF ??.?? FOR VALUES FROM ('${today.toISOString()}') TO ('${today.add(2, 'day').toISOString()}')`, [
            schema,
            overlapping,
            schema,
            table
        ]);

        const res = await ensureDailyPartitions({ knex, schema, table, dates: [today.toDate(), today.add(1, 'day').toDate(), today.add(2, 'day').toDate()] });
        expect(res.isErr() && res.error.message).toBe(`Failed to ensure partitions ${schema}.${name('20260930')}, ${schema}.${name('20261001')}`);
        expect(await partitions()).toEqual([name('20261002')]);

        await knex.raw('DROP TABLE IF EXISTS ??.??', [schema, overlapping]);
    });

    it('drops expired partitions only, including the ones overdue after downtime', async () => {
        // Creates Oct 1, 2 and 3.
        await tick(new Date('2026-10-01T12:00:00Z'), 7);
        await tick(new Date('2026-10-02T12:00:00Z'), 7);

        // The next tick is on Oct 10, so the overdue Oct 1 and Oct 2 are dropped together.
        expect(await tick(new Date('2026-10-10T23:59:59Z'), 7)).toEqual({ dropped: 2, skipped: 0 });
        expect(await partitions()).toEqual([name('20261003'), name('20261010'), name('20261011')]);

        // From Oct 11 onwards, Oct 3 is dropped.
        expect(await tick(new Date('2026-10-11T00:00:00Z'), 7)).toEqual({ dropped: 1, skipped: 0 });
        expect(await partitions()).toEqual([name('20261010'), name('20261011'), name('20261012')]);
    });

    it('refuses a retention that would drop the partition holding live data', async () => {
        (await ensureDailyPartitions({ knex, schema, table, dates: [new Date('2026-01-01T00:00:00Z'), new Date('2026-10-09T00:00:00Z')] })).unwrap();
        for (const retentionDays of [-1, 0, 1.5]) {
            expect((await dropExpiredDailyPartitions({ knex, schema, table, retentionDays, now: new Date('2026-10-09T12:00:00Z') })).isErr()).toBe(true);
        }
        expect(await partitions()).toHaveLength(2);
    });

    it('does not drop a partition placed in another schema', async () => {
        const from = dayjs('2026-01-01T00:00:00Z').utc();
        await knex.raw('CREATE SCHEMA IF NOT EXISTS ??', [foreignSchema]);
        await knex.raw(`CREATE TABLE ??.?? PARTITION OF ??.?? FOR VALUES FROM ('${from.toISOString()}') TO ('${from.add(1, 'day').toISOString()}')`, [
            foreignSchema,
            name('20260101'),
            schema,
            table
        ]);

        const res = await dropExpiredDailyPartitions({ knex, schema, table, retentionDays: 90, now: new Date('2026-10-09T12:00:00Z') });
        expect(res.isOk() && res.value).toEqual({ dropped: 0, skipped: 0 });
    });
});
