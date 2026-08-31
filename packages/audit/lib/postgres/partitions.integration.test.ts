import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import knexFactory from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';
import { dropExpiredPartitions, ensurePartition } from './partitions.js';
import { AUDIT_EVENTS_TABLE } from './schema.js';

import type { Knex } from 'knex';

const schema = 'audit_partitions_test';
dayjs.extend(utc);

const now = new Date('2026-09-30T12:00:00Z');
const day = (offset: number) => dayjs(now).utc().add(offset, 'day').toDate();

let knex: Knex;

async function partitions(): Promise<string[]> {
    const { rows } = await knex.raw<{ rows: { relname: string }[] }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ? AND c.relkind = 'r' AND c.relname ~ ? ORDER BY c.relname`,
        [schema, `^${AUDIT_EVENTS_TABLE}_[0-9]{8}$`]
    );
    return rows.map((r) => r.relname);
}

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    expect((await migrate({ knex, schema })).isOk()).toBe(true);
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

beforeEach(async () => {
    for (const name of await partitions()) {
        await knex.raw('DROP TABLE IF EXISTS ??.??', [schema, name]);
    }
});

describe('audit partition lifecycle', () => {
    it('is idempotent, so every tick can ensure the same day', async () => {
        expect((await ensurePartition({ knex, schema, date: now })).isOk()).toBe(true);
        expect((await ensurePartition({ knex, schema, date: now })).isOk()).toBe(true);
        expect(await partitions()).toEqual([`${AUDIT_EVENTS_TABLE}_20260930`]);
    });

    it('covers its whole day and neither of the neighbouring ones', async () => {
        await ensurePartition({ knex, schema, date: now });
        const insert = (occurredAt: string) =>
            knex.raw(`INSERT INTO ??.?? (event, occurred_at) VALUES (?, ?)`, [
                schema,
                AUDIT_EVENTS_TABLE,
                JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', accountId: 1, occurredAt, resource: 'sync', action: 'paused' }),
                occurredAt
            ]);
        await expect(insert('2026-09-30T00:00:00.000Z')).resolves.toMatchObject({ rowCount: 1 });
        await expect(insert('2026-09-30T23:59:59.999Z')).resolves.toMatchObject({ rowCount: 1 });
        await expect(insert('2026-09-29T23:59:59.999Z')).rejects.toThrow(/no partition of relation/);
        await expect(insert('2026-10-01T00:00:00.000Z')).rejects.toThrow(/no partition of relation/);
    });

    it('drops expired partitions and preserves the rest', async () => {
        // -366 and -365 straddle the cutoff, so the pair pins where it falls
        for (const offset of [-400, -366, -365, -10, 0]) {
            await ensurePartition({ knex, schema, date: day(offset) });
        }

        const res = await dropExpiredPartitions({ knex, schema, retentionDays: 365, now });
        expect(res.isOk() && res.value).toEqual({ dropped: 2, skipped: 0 });
        expect(await partitions()).toEqual([
            `${AUDIT_EVENTS_TABLE}_${dayjs(day(-365)).utc().format('YYYYMMDD')}`,
            `${AUDIT_EVENTS_TABLE}_${dayjs(day(-10)).utc().format('YYYYMMDD')}`,
            `${AUDIT_EVENTS_TABLE}_20260930`
        ]);
    });
});
