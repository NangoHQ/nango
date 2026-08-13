import { createClient } from '@clickhouse/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditClickhouseClient } from './clickhouse.js';

import type { ClickHouseClient } from '@clickhouse/client';

let url: string;
let admin: ClickHouseClient;

beforeAll(async () => {
    url = process.env['CLICKHOUSE_URL']!;
    admin = createClient({ url });
    // The default target has to exist for a session to open against it.
    await admin.command({ query: `CREATE DATABASE IF NOT EXISTS audit` });
});

afterAll(async () => {
    await admin.close();
});

async function currentDatabase(client: ClickHouseClient): Promise<string | undefined> {
    const rows = await (await client.query({ query: `SELECT currentDatabase() AS db`, format: 'JSONEachRow' })).json<{ db: string }>();
    return rows[0]?.db;
}

describe('auditClickhouseClient', () => {
    // Callers that pass nothing must reach the dedicated audit database, otherwise they silently land
    // on the ClickHouse default and every write fails.
    it('defaults to the dedicated audit database', async () => {
        const client = auditClickhouseClient(url);
        try {
            expect(await currentDatabase(client)).toBe('audit');
        } finally {
            await client.close();
        }
    });

    it('uses an explicitly requested database', async () => {
        await admin.command({ query: `CREATE DATABASE IF NOT EXISTS audit_client_test` });
        const client = auditClickhouseClient(url, { database: 'audit_client_test' });
        try {
            expect(await currentDatabase(client)).toBe('audit_client_test');
        } finally {
            await client.close();
            await admin.command({ query: `DROP DATABASE IF EXISTS audit_client_test` });
        }
    });

    // How the migration runner connects before the audit database exists.
    it('connects without a database when passed null', async () => {
        const client = auditClickhouseClient(url, { database: null });
        try {
            expect(await currentDatabase(client)).toBe('default');
        } finally {
            await client.close();
        }
    });
});
