import knexFactory from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';
import { AUDIT_EVENTS_TABLE } from './schema.js';

import type { Knex } from 'knex';

const schema = 'audit_migrate_test';
const table = `${schema}.${AUDIT_EVENTS_TABLE}`;

let knex: Knex;

const event = (id: string, accountId: number, occurredAt: string) =>
    JSON.stringify({ id, accountId, occurredAt, scope: 'environment', resource: 'sync', action: 'paused' });

async function insert(id: string, accountId: number, occurredAt: string): Promise<void> {
    await knex.raw(`INSERT INTO ${table} (event, occurred_at) VALUES (?, ?)`, [event(id, accountId, occurredAt), occurredAt]);
}

beforeAll(async () => {
    // Same URL construction the fleet package's integration tests use.
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    expect((await migrate({ knex, schema })).isOk()).toBe(true);
});

// Partition bounds cannot be bind parameters -- Postgres reports the DDL as taking none -- so the
// lifecycle job will have to format them too. Per-test rather than in beforeAll, so a broken partition
// strategy fails the test that names it instead of skipping the whole suite.
async function ensurePartition(): Promise<void> {
    await knex.raw(`CREATE TABLE IF NOT EXISTS ??.?? PARTITION OF ${table} FOR VALUES FROM ('2026-09-01T00:00:00Z') TO ('2026-09-02T00:00:00Z')`, [
        schema,
        `${AUDIT_EVENTS_TABLE}_20260901`
    ]);
}

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('audit postgres migrate', () => {
    it('creates the schema and applies only the audit set', async () => {
        const applied = await knex.raw(`SELECT name FROM ??.migrations ORDER BY name`, [schema]);
        expect(applied.rows.map((r: { name: string }) => r.name)).toEqual(['20260901000001_create_audit_trail_events']);
    });

    it('is idempotent, so a restart re-running it is a no-op', async () => {
        expect((await migrate({ knex, schema })).isOk()).toBe(true);
        const applied = await knex.raw(`SELECT count(*)::int AS n FROM ??.migrations`, [schema]);
        expect(applied.rows[0].n).toBe(1);
    });

    it('derives every column but occurred_at from the event, so none can disagree with it', async () => {
        await ensurePartition();
        await insert('11111111-1111-4111-8111-111111111111', 42, '2026-09-01T10:00:00.000Z');

        const rows = await knex.raw(`SELECT id::text, account_id::int, resource, action FROM ${table}`);
        expect(rows.rows).toEqual([{ id: '11111111-1111-4111-8111-111111111111', account_id: 42, resource: 'sync', action: 'paused' }]);
    });

    it('refuses an event with no account id, which no account-scoped read could ever return', async () => {
        await ensurePartition();
        const blob = JSON.stringify({ id: '44444444-4444-4444-8444-444444444444', occurredAt: '2026-09-01T12:00:00.000Z', resource: 'sync', action: 'paused' });
        await expect(knex.raw(`INSERT INTO ${table} (event, occurred_at) VALUES (?, ?)`, [blob, '2026-09-01T12:00:00.000Z'])).rejects.toThrow(
            /violates not-null constraint/
        );
    });

    it('refuses an event whose account id is negative', async () => {
        await ensurePartition();
        await expect(insert('22222222-2222-4222-8222-222222222222', -1, '2026-09-01T11:00:00.000Z')).rejects.toThrow(
            /audit_trail_events_account_id_nonnegative/
        );
    });
});
