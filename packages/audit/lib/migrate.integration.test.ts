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

    it('skips when ClickHouse is not configured', async () => {
        expect((await migrate({ clickhouseUrl: undefined, database })).isOk()).toBe(true);
    });
});
