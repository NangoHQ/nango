import knexFactory from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from '../postgres/migrate.js';
import { ensurePartition } from '../postgres/partitions.js';
import { PostgresAuditStore } from './postgres.js';

import type { Knex } from 'knex';

const schema = 'audit_store_test';
const accountId = 42;

let knex: Knex;
let store: PostgresAuditStore;

const event = (id: string, occurredAt: string, extra: Record<string, unknown> = {}) => ({
    event: JSON.stringify({
        id,
        accountId,
        occurredAt,
        scope: 'environment',
        environment: { id: 1, display: 'dev' },
        actor: { type: 'user', id: '7' },
        targets: [],
        context: {},
        outcome: 'success',
        resource: 'sync',
        action: 'paused',
        ...extra
    })
});

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: url } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    expect((await migrate({ knex, schema })).isOk()).toBe(true);
    await ensurePartition({ knex, schema, date: new Date('2026-09-30T00:00:00Z') });
    store = new PostgresAuditStore(knex, schema);
});

beforeEach(async () => {
    await knex.raw('TRUNCATE ??.audit_trail_events', [schema]);
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

describe('postgres audit store', () => {
    it('writes an event and fills the columns derived from it', async () => {
        expect((await store.record(event(uuid(1), '2026-09-30T10:00:00.000Z'))).isOk()).toBe(true);

        const { rows } = await knex.raw(`SELECT occurred_at, account_id::int, resource, action FROM ??.audit_trail_events`, [schema]);
        expect(rows).toEqual([{ occurred_at: new Date('2026-09-30T10:00:00.000Z'), account_id: accountId, resource: 'sync', action: 'paused' }]);
    });

    it('keeps the stored event when the same id is redelivered with different content', async () => {
        await store.record(event(uuid(1), '2026-09-30T10:00:00.000Z')).then((r) => r.unwrap());
        await store.record(event(uuid(1), '2026-09-30T10:00:00.000Z', { outcome: 'failure', action: 'started' })).then((r) => r.unwrap());

        const events = (await store.list({ accountId, limit: 50 })).unwrap().events;
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ id: uuid(1), outcome: 'success', action: 'paused' });
    });

    it('returns the newest events first and pages with the cursor', async () => {
        for (const n of [1, 2, 3, 4]) {
            await store.record(event(uuid(n), `2026-09-30T1${n}:00:00.000Z`));
        }

        const first = (await store.list({ accountId, limit: 2 })).unwrap();
        expect(first.events.map((e) => e.id)).toEqual([uuid(4), uuid(3)]);
        expect(first.nextCursor).not.toBeNull();

        const second = (await store.list({ accountId, limit: 2, before: first.nextCursor! })).unwrap();
        expect(second.events.map((e) => e.id)).toEqual([uuid(2), uuid(1)]);
        expect(second.nextCursor).toBeNull();
    });

    it('only returns events belonging to the requested account', async () => {
        await store.record(event(uuid(1), '2026-09-30T10:00:00.000Z'));
        const other = { event: event(uuid(9), '2026-09-30T10:30:00.000Z').event.replace(`"accountId":${accountId}`, '"accountId":99') };
        expect((await store.record(other)).isOk()).toBe(true);

        const events = (await store.list({ accountId, limit: 50 })).unwrap().events;
        expect(events.map((e) => e.id)).toEqual([uuid(1)]);
    });

    it('filters by resource and action together', async () => {
        await store.record(event(uuid(1), '2026-09-30T10:00:00.000Z'));
        await store.record(event(uuid(5), '2026-09-30T15:00:00.000Z', { resource: 'connection', action: 'deleted' }));

        const events = (await store.list({ accountId, limit: 50, resources: ['sync', 'connection'], actions: ['deleted'] })).unwrap().events;
        expect(events.map((e) => e.id)).toEqual([uuid(5)]);
    });
});
