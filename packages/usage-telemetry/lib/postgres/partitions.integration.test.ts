import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import knexFactory from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';
import { dropExpiredPartitions, ensurePartitions } from './partitions.js';
import { USAGE_TELEMETRY_TABLE } from './schema.js';

import type { Knex } from 'knex';

dayjs.extend(utc);

const schema = 'usage_telemetry_partitions_test';
const foreignSchema = `${schema}_foreign`;
const name = (date: string) => `${USAGE_TELEMETRY_TABLE}_${date}`;

let knex: Knex;

async function partitions(): Promise<string[]> {
    const { rows } = await knex.raw<{ rows: { relname: string }[] }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ? AND c.relkind = 'r' AND c.relname ~ ? ORDER BY c.relname`,
        [schema, `^${USAGE_TELEMETRY_TABLE}_[0-9]{8}$`]
    );
    return rows.map((r) => r.relname);
}

/** What the daemon does on each tick, at a given time. */
async function tick(now: Date, retentionDays = 90): Promise<{ dropped: number; skipped: number }> {
    (await ensurePartitions({ knex, schema, dates: [now, dayjs(now).utc().add(1, 'day').toDate()] })).unwrap();
    return (await dropExpiredPartitions({ knex, schema, retentionDays, now })).unwrap();
}

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    expect((await migrate({ knex, schema })).isOk()).toBe(true);
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

describe('usage telemetry partition lifecycle', () => {
    it('creates today and tomorrow across the UTC year boundary, and is idempotent', async () => {
        await tick(new Date('2026-12-31T23:30:00Z'));
        expect(await partitions()).toEqual([name('20261231'), name('20270101')]);

        await tick(new Date('2026-12-31T23:30:00Z'));
        expect(await partitions()).toEqual([name('20261231'), name('20270101')]);
    });

    it('covers its whole day and neither of the neighbouring ones', async () => {
        await ensurePartitions({ knex, schema, dates: [new Date('2026-10-09T12:00:00Z')] });
        const insert = (ts: string) => knex.withSchema(schema).table(USAGE_TELEMETRY_TABLE).insert({ ts, value: 1, metric: 'test.metric' });
        await expect(insert('2026-10-09T00:00:00.000Z')).resolves.toBeDefined();
        await expect(insert('2026-10-09T23:59:59.999Z')).resolves.toBeDefined();
        await expect(insert('2026-10-08T23:59:59.999Z')).rejects.toThrow(/no partition of relation/);
        await expect(insert('2026-10-10T00:00:00.000Z')).rejects.toThrow(/no partition of relation/);
    });

    it('drops expired partitions only', async () => {
        // Creates Oct 1, 2 and 3.
        await tick(new Date('2026-10-01T12:00:00Z'), 7);
        await tick(new Date('2026-10-02T12:00:00Z'), 7);

        // Downtime: the next tick is on Oct 10, so the overdue Oct 1 and Oct 2 are  dropped.
        expect(await tick(new Date('2026-10-10T23:59:59Z'), 7)).toEqual({ dropped: 2, skipped: 0 });
        expect(await partitions()).toEqual([name('20261003'), name('20261010'), name('20261011')]);

        // From Oct 11 onwards, Oct 3 is dropped.
        expect(await tick(new Date('2026-10-11T00:00:00Z'), 7)).toEqual({ dropped: 1, skipped: 0 });
        expect(await partitions()).toEqual([name('20261010'), name('20261011'), name('20261012')]);
    });

    it('refuses a retention that would drop the partition holding live data', async () => {
        await ensurePartitions({ knex, schema, dates: [new Date('2026-01-01T00:00:00Z'), new Date('2026-10-09T00:00:00Z')] });
        for (const retentionDays of [-1, 0, 1.5]) {
            expect((await dropExpiredPartitions({ knex, schema, retentionDays, now: new Date('2026-10-09T12:00:00Z') })).isErr()).toBe(true);
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
            USAGE_TELEMETRY_TABLE
        ]);

        const res = await dropExpiredPartitions({ knex, schema, retentionDays: 90, now: new Date('2026-10-09T12:00:00Z') });
        expect(res.isOk() && res.value).toEqual({ dropped: 0, skipped: 0 });
    });
});
