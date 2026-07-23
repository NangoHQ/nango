import { createClient } from '@clickhouse/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClickhouseAuditStore } from './store.js';

import type { AuditEvent } from './event.js';
import type { ClickHouseClient } from '@clickhouse/client';

// `audit_trail_events` currently lives in the `usage` ClickHouse DB, created by the usage migration
// (a future change will move it to a dedicated audit DB + migration owned here). To keep this package's
// tests self-contained, the test owns a throwaway DB and mirrors that migration's DDL rather than depending
// on @nangohq/usage. Keep in sync with:
//   packages/usage/lib/clickhouse/migrations/20260715000009_create_audit_trail_events.ts
const database = 'audit_store_test';
const createTable = `
    CREATE TABLE IF NOT EXISTS ${database}.audit_trail_events
    (
        event          String CODEC(ZSTD(3)),
        retention_days UInt16,
        id             UUID          MATERIALIZED toUUID(JSONExtractString(event, 'id')),
        account_id     Int64         MATERIALIZED JSONExtractInt(event, 'accountId'),
        occurred_at    DateTime64(3) MATERIALIZED parseDateTime64BestEffort(JSONExtractString(event, 'occurredAt'), 3)
    )
    ENGINE = ReplacingMergeTree
    PARTITION BY (retention_days, toYYYYMM(occurred_at))
    ORDER BY (account_id, occurred_at, id)
    TTL toDateTime(occurred_at) + INTERVAL retention_days DAY
    SETTINGS ttl_only_drop_parts = 1
`;

// Recent base time so rows aren't born-expired by the retention TTL.
const base = new Date('2026-07-16T10:00:00.000Z').getTime();
const at = (offsetMs: number) => new Date(base + offsetMs).toISOString();

let client: ClickHouseClient;
let store: ClickhouseAuditStore;

// Raw insert with a known id so read assertions are deterministic (record() stamps a random id).
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
    await admin.command({ query: `CREATE DATABASE ${database}` });
    await admin.command({ query: createTable });
    await admin.close();

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

describe('ClickhouseAuditStore.record', () => {
    it('writes an event that reads back with a stamped id + version', async () => {
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
        expect((await store.record(event)).isOk()).toBe(true);

        const { events } = (await store.list({ accountId: 7, limit: 10 })).unwrap();
        expect(events).toHaveLength(1);
        expect(events[0]!.accountId).toBe(7);
        expect(events[0]!.version).toBe('2026-07-16');
        expect(events[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(events[0]!.resource).toBe('connection');
    });
});
