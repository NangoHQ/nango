import { createClient } from '@clickhouse/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';

import type { ClickHouseClient } from '@clickhouse/client';

const database = 'installations_migrate_test';

let url: string;
let admin: ClickHouseClient;

async function rows<T>(query: string): Promise<T[]> {
    return (await admin.query({ query, format: 'JSONEachRow', query_params: { db: database } })).json<T>();
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

describe('installations migrate', () => {
    it('creates the database with the metrics table, deduplicating on received_at and keeping rows for 24 months', async () => {
        expect((await migrate({ clickhouseUrl: url, database })).isOk()).toBe(true);

        expect((await rows<{ name: string }>(`SELECT name FROM system.tables WHERE database = {db:String} ORDER BY name`)).map((r) => r.name)).toEqual([
            'metrics',
            'migrations'
        ]);
        const [table] = await rows<{ engine_full: string; sorting_key: string; partition_key: string }>(
            `SELECT engine_full, sorting_key, partition_key FROM system.tables WHERE database = {db:String} AND name = 'metrics'`
        );
        expect(table).toMatchObject({ sorting_key: 'installation_id, metric, ts, attributes', partition_key: 'toYYYYMM(ts)' });
        expect(table?.engine_full).toMatch(/^ReplacingMergeTree\(received_at\)/);
        expect(table?.engine_full).toContain('TTL toDateTime(ts) + toIntervalMonth(24)');
    });

    it('does not re-apply an already-applied migration', async () => {
        expect((await migrate({ clickhouseUrl: url, database })).isOk()).toBe(true);

        const [applied] = await rows<{ count: string }>(`SELECT count() AS count FROM {db:Identifier}.migrations`);
        expect(Number(applied?.count)).toBe(1);
    });
});
