import { createClient } from '@clickhouse/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditClient } from '../client.js';
import { migrate } from '../migrate.js';
import { ClickhouseAuditStore } from './clickhouse.js';

import type { ClickHouseClient } from '@clickhouse/client';
import type { AuditEvent } from '@nangohq/types';

const database = 'audit_store_test';

// Recent base time so rows aren't born-expired by the retention TTL.
const base = new Date('2026-07-16T10:00:00.000Z').getTime();
const at = (offsetMs: number) => new Date(base + offsetMs).toISOString();

let client: ClickHouseClient;
let store: ClickhouseAuditStore;

// Known ids so the read assertions below are deterministic.
async function insertEvent({
    id,
    accountId,
    occurredAt,
    resource = 'connection',
    action = 'deleted'
}: {
    id: string;
    accountId: number;
    occurredAt: string;
    resource?: string;
    action?: string;
}) {
    const event = {
        id,
        version: '2026-07-16',
        occurredAt,
        accountId,
        scope: 'environment',
        environment: null,
        actor: { type: 'user', id: '5', display: 'a@b.co' },
        resource,
        action,
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

    // account 3: one event per resource/action pair the filter tests select on
    await insertEvent({ id: 'aaaaaaaa-0000-0000-0000-000000000001', accountId: 3, occurredAt: at(0), resource: 'connection', action: 'deleted' });
    await insertEvent({ id: 'aaaaaaaa-0000-0000-0000-000000000002', accountId: 3, occurredAt: at(1000), resource: 'connection', action: 'updated' });
    await insertEvent({ id: 'aaaaaaaa-0000-0000-0000-000000000003', accountId: 3, occurredAt: at(2000), resource: 'api_key', action: 'deleted' });
    await insertEvent({ id: 'aaaaaaaa-0000-0000-0000-000000000004', accountId: 3, occurredAt: at(3000), resource: 'sync', action: 'enabled' });
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

describe('ClickhouseAuditStore.list resource filters', () => {
    const resourceActionOf = (events: { resource: string; action: string }[]) => events.map((e) => `${e.resource}.${e.action}`).sort();

    it('filters by resource', async () => {
        const { events } = (await store.list({ accountId: 3, limit: 10, resources: ['connection'] })).unwrap();
        expect(resourceActionOf(events)).toEqual(['connection.deleted', 'connection.updated']);
        expect(events.every((e) => e.accountId === 3)).toBe(true);
    });

    it('filters by several resources at once', async () => {
        const { events } = (await store.list({ accountId: 3, limit: 10, resources: ['api_key', 'sync'] })).unwrap();
        expect(resourceActionOf(events)).toEqual(['api_key.deleted', 'sync.enabled']);
    });

    it('narrows a resource to a single action', async () => {
        const { events } = (await store.list({ accountId: 3, limit: 10, resources: ['connection'], actions: ['deleted'] })).unwrap();
        expect(resourceActionOf(events)).toEqual(['connection.deleted']);
    });

    // The pairs are the cross product, so an action belonging to another resource must not widen the match.
    it('matches actions against their own resource only', async () => {
        const onSync = (await store.list({ accountId: 3, limit: 10, resources: ['sync'], actions: ['enabled'] })).unwrap();
        expect(resourceActionOf(onSync.events)).toEqual(['sync.enabled']);

        // Same action, a resource that never records it: the pair matches nothing rather than falling
        // back to either half.
        const onConnection = (await store.list({ accountId: 3, limit: 10, resources: ['connection'], actions: ['enabled'] })).unwrap();
        expect(onConnection.events).toHaveLength(0);
    });

    it('ignores actions given without a resource, since a pair needs both halves', async () => {
        const { events } = (await store.list({ accountId: 3, limit: 10, actions: ['deleted'] })).unwrap();
        expect(resourceActionOf(events)).toEqual(['api_key.deleted', 'connection.deleted', 'connection.updated', 'sync.enabled']);
    });

    it('combines with the date window and paginates', async () => {
        const page1 = (await store.list({ accountId: 3, limit: 1, resources: ['connection'], from: at(0), to: at(1000) })).unwrap();
        expect(resourceActionOf(page1.events)).toEqual(['connection.updated']);
        expect(page1.nextCursor).not.toBeNull();

        const page2 = (await store.list({ accountId: 3, limit: 1, resources: ['connection'], from: at(0), to: at(1000), before: page1.nextCursor! })).unwrap();
        expect(resourceActionOf(page2.events)).toEqual(['connection.deleted']);
    });

    it('returns nothing for a resource that was never recorded', async () => {
        const { events } = (await store.list({ accountId: 3, limit: 10, resources: ['team'] })).unwrap();
        expect(events).toHaveLength(0);
    });
});

describe('AuditClient.record through ClickhouseAuditStore', () => {
    it('writes an emitted event that reads back with the id + version stamped at emit', async () => {
        const event: AuditEvent = {
            occurredAt: at(5000),
            accountId: 7,
            scope: 'environment',
            environment: { id: 'e0000000-0000-4000-8000-000000000001', display: 'dev' },
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

    it('does not hand a copy back on the next page, since the cursor excludes the boundary row it shares a key with', async () => {
        const newer = '55555555-5555-5555-5555-555555555555';
        const older = '66666666-6666-6666-6666-666666666666';
        await client.command({ query: `SYSTEM STOP MERGES ${database}.audit_trail_events` });
        try {
            await insertEvent({ id: newer, accountId: 10, occurredAt: at(4000) });
            await insertEvent({ id: newer, accountId: 10, occurredAt: at(4000) });
            await insertEvent({ id: older, accountId: 10, occurredAt: at(3000) });

            // Without this the test degrades into a plain pagination check the moment anything collapses the
            // copy before the read sees it.
            const raw = await client.query({
                query: `SELECT count() AS c FROM ${database}.audit_trail_events WHERE account_id = 10`,
                format: 'JSONEachRow'
            });
            expect(Number((await raw.json<{ c: string | number }>())[0]!.c)).toBe(3);

            // One per page, so the copy of `newer` can only be excluded by the cursor rather than by the
            // in-page filter. Under a non-strict comparison it comes back as page two.
            const first = (await store.list({ accountId: 10, limit: 1 })).unwrap();
            expect(first.events.map((e) => e.id)).toEqual([newer]);
            expect(first.nextCursor).not.toBeNull();

            const second = (await store.list({ accountId: 10, limit: 1, before: first.nextCursor! })).unwrap();
            expect(second.events.map((e) => e.id)).toEqual([older]);
            expect(second.nextCursor).toBeNull();
        } finally {
            await client.command({ query: `SYSTEM START MERGES ${database}.audit_trail_events` });
        }
    });
});
