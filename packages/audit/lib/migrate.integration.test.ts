import { createClient } from '@clickhouse/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';

import type { ClickHouseClient } from '@clickhouse/client';

const database = 'audit_migrate_test';

let url: string;
let admin: ClickHouseClient;

async function tables(): Promise<string[]> {
    const res = await admin.query({
        query: `SELECT name FROM system.tables WHERE database = {db:String} ORDER BY name`,
        format: 'JSONEachRow',
        query_params: { db: database }
    });
    return (await res.json<{ name: string }>()).map((r) => r.name);
}

async function appliedMigrations(): Promise<string[]> {
    const res = await admin.query({ query: `SELECT name FROM ${database}.migrations FINAL ORDER BY name`, format: 'JSONEachRow' });
    return (await res.json<{ name: string }>()).map((r) => r.name);
}

beforeAll(async () => {
    url = process.env['CLICKHOUSE_URL']!;
    admin = createClient({ url });
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
});

afterAll(async () => {
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    await admin.close();
});

describe('audit migrate', () => {
    it('creates the database and applies only the audit migration set', async () => {
        expect((await migrate({ clickhouseUrl: url, database })).isOk()).toBe(true);

        // Exact match: audit runs its own migration set, so none of the usage tables may appear here.
        expect(await tables()).toEqual(['audit_trail_events', 'migrations']);
        expect(await appliedMigrations()).toEqual([expect.stringMatching(/^20260729000001_create_audit_trail_events\.[jt]s$/)]);
    });

    it('does not re-apply an already-applied migration', async () => {
        expect((await migrate({ clickhouseUrl: url, database })).isOk()).toBe(true);

        // Deliberately no FINAL: re-applying inserts a second row for the same name, which FINAL would hide.
        const res = await admin.query({ query: `SELECT count() AS count FROM ${database}.migrations`, format: 'JSONEachRow' });
        expect(Number((await res.json<{ count: string }>())[0]!.count)).toBe(1);
    });

    it('rejects an event whose accountId is missing, malformed or not a real account id', async () => {
        const insert = async (id: string, accountId?: unknown): Promise<'accepted' | 'rejected'> => {
            const event = { id, occurredAt: '2026-07-29T10:00:00.000Z', ...(accountId === undefined ? {} : { accountId }) };
            try {
                await admin.insert({
                    table: `${database}.audit_trail_events`,
                    values: [{ event: JSON.stringify(event), retention_days: 90 }],
                    format: 'JSONEachRow'
                });
                return 'accepted';
            } catch {
                return 'rejected';
            }
        };

        expect(await insert('aaaaaaaa-0000-0000-0000-000000000001', 42)).toBe('accepted');
        expect(await insert('aaaaaaaa-0000-0000-0000-000000000002', 1)).toBe('accepted');
        expect(await insert('aaaaaaaa-0000-0000-0000-000000000003', 'not-a-number')).toBe('rejected');
        expect(await insert('aaaaaaaa-0000-0000-0000-000000000004')).toBe('rejected');
        expect(await insert('aaaaaaaa-0000-0000-0000-000000000005', 0)).toBe('rejected');
        expect(await insert('aaaaaaaa-0000-0000-0000-000000000006', -5)).toBe('rejected');
    });

    // Guards the two premises the accountId constraint rests on. If a ClickHouse upgrade changed either,
    // the constraint would silently reject every event instead of just the invalid ones.
    it('parses a plain JSON integer as Int64, and keeps account_id signed', async () => {
        const types = await (
            await admin.query({
                query: `SELECT JSONType('{"a":42}', 'a') AS positive,
                               JSONType('{"a":-5}', 'a') AS negative,
                               JSONType('{"a":18446744073709551615}', 'a') AS above_int64`,
                format: 'JSONEachRow'
            })
        ).json<{ positive: string; negative: string; above_int64: string }>();
        expect(types[0]).toEqual({ positive: 'Int64', negative: 'Int64', above_int64: 'UInt64' });

        // Signed, so a negative accountId stays negative instead of wrapping past the > 0 guard.
        const columns = await (
            await admin.query({
                query: `SELECT type FROM system.columns WHERE database = {db:String} AND table = 'audit_trail_events' AND name = 'account_id'`,
                format: 'JSONEachRow',
                query_params: { db: database }
            })
        ).json<{ type: string }>();
        expect(columns[0]?.type).toBe('Int64');
    });

    it('skips when ClickHouse is not configured', async () => {
        expect((await migrate({ clickhouseUrl: undefined, database })).isOk()).toBe(true);
    });
});
