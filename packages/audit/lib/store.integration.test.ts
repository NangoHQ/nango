import { createClient } from '@clickhouse/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditClient } from './audit.js';
import { migrate } from './migrate.js';
import { ClickhouseAuditStore } from './store.js';

import type { AuditEvent } from './event.js';
import type { ClickHouseClient } from '@clickhouse/client';

const database = 'audit_store_test';

// Recent base time so rows aren't born-expired by the retention TTL.
const base = new Date('2026-07-16T10:00:00.000Z').getTime();
const at = (offsetMs: number) => new Date(base + offsetMs).toISOString();

let client: ClickHouseClient;
let store: ClickhouseAuditStore;

// Known ids so the read assertions below are deterministic.
async function insertEvent({ id, accountId, occurredAt }: { id: string; accountId: number; occurredAt: string }) {
    const event = {
        id,
        version: '2026-07-16',
        occurredAt,
        accountId,
        environment: null,
        actor: { type: 'user', id: '5', display: 'a@b.co' },
        resource: 'connection',
        action: 'deleted',
        targets: [{ type: 'connection', id: '10' }],
        context: {},
        outcome: 'success'
    };
    await client.insert({
        table: `${database}.audit_trail_events`,
        values: [{ event: JSON.stringify(event), retention_days: 365 }],
        format: 'JSONEachRow'
    });
}

beforeAll(async () => {
    const url = process.env['CLICKHOUSE_URL']!;
    const admin = createClient({ url });
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    await admin.close();

    (await migrate({ clickhouseUrl: url, database })).unwrap();

    client = createClient({ url, database });
    store = new ClickhouseAuditStore(client);

    // account 1: three events (oldest → newest); account 2: one (must never leak into account 1's results)
    await insertEvent({ id: '11111111-1111-1111-1111-111111111111', accountId: 1, occurredAt: at(0) });
    await insertEvent({ id: '22222222-2222-2222-2222-222222222222', accountId: 1, occurredAt: at(1000) });
    await insertEvent({ id: '33333333-3333-3333-3333-333333333333', accountId: 1, occurredAt: at(2000) });
    await insertEvent({ id: '99999999-9999-9999-9999-999999999999', accountId: 2, occurredAt: at(1500) });
});

afterAll(async () => {
    await client.close();
});

describe('ClickhouseAuditStore.list', () => {
    it("returns an account's events most-recent first, never another account's", async () => {
        const { events, nextCursor } = (await store.list({ accountId: 1, limit: 10 })).unwrap();
        expect(events.map((e) => e.id)).toEqual([
            '33333333-3333-3333-3333-333333333333',
            '22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111'
        ]);
        expect(events.every((e) => e.accountId === 1)).toBe(true);
        expect(nextCursor).toBeNull();
    });

    it('does not leak across accounts', async () => {
        const { events } = (await store.list({ accountId: 2, limit: 10 })).unwrap();
        expect(events.map((e) => e.id)).toEqual(['99999999-9999-9999-9999-999999999999']);
    });

    it('keyset-paginates via the before cursor', async () => {
        const page1 = (await store.list({ accountId: 1, limit: 2 })).unwrap();
        expect(page1.events.map((e) => e.id)).toEqual(['33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222']);
        expect(page1.nextCursor).not.toBeNull();

        const page2 = (await store.list({ accountId: 1, limit: 2, before: page1.nextCursor! })).unwrap();
        expect(page2.events.map((e) => e.id)).toEqual(['11111111-1111-1111-1111-111111111111']);
        expect(page2.nextCursor).toBeNull();
    });

    it('filters by from/to date', async () => {
        const { events } = (await store.list({ accountId: 1, limit: 10, from: at(1000), to: at(2000) })).unwrap();
        expect(events.map((e) => e.id)).toEqual(['33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222']);
    });
});

describe('AuditClient.record through ClickhouseAuditStore', () => {
    it('writes an emitted event that reads back with the id + version stamped at emit', async () => {
        const event: AuditEvent = {
            occurredAt: at(5000),
            accountId: 7,
            environment: { id: 2, display: 'dev' },
            actor: { type: 'user', id: '5', display: 'a@b.co' },
            resource: 'connection',
            action: 'deleted',
            targets: [{ type: 'connection', id: '10' }],
            context: {},
            outcome: 'success'
        };
        expect((await new AuditClient(store, store).record(event)).isOk()).toBe(true);

        const { events } = (await store.list({ accountId: 7, limit: 10 })).unwrap();
        expect(events).toHaveLength(1);
        expect(events[0]!.accountId).toBe(7);
        expect(events[0]!.version).toBe('2026-07-16');
        expect(events[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(events[0]!.resource).toBe('connection');
    });
});

describe('ClickhouseAuditStore.list deduplication', () => {
    it('returns one row for an event that was stored twice', async () => {
        const id = '44444444-4444-4444-4444-444444444444';
        // Merges are what eventually collapse a ReplacingMergeTree duplicate, and on a table this small one
        // fires almost immediately — stopping them is what makes this test the read path rather than a merge.
        await client.command({ query: `SYSTEM STOP MERGES ${database}.audit_trail_events` });
        try {
            // At-least-once delivery: the same event, same ORDER BY key, written by two separate attempts.
            await insertEvent({ id, accountId: 9, occurredAt: at(3000) });
            await insertEvent({ id, accountId: 9, occurredAt: at(3000) });

            const raw = await client.query({
                query: `SELECT count() AS c FROM ${database}.audit_trail_events WHERE account_id = 9`,
                format: 'JSONEachRow'
            });
            expect(Number((await raw.json<{ c: string | number }>())[0]!.c)).toBe(2);

            // Both rows are in storage, yet the read returns one — so a redelivered event never shows up
            // twice in the dashboard while it waits for a merge.
            const { events } = (await store.list({ accountId: 9, limit: 10 })).unwrap();
            expect(events).toHaveLength(1);
            expect(events[0]!.id).toBe(id);
        } finally {
            await client.command({ query: `SYSTEM START MERGES ${database}.audit_trail_events` });
        }
    });
});
