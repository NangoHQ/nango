import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('./20260715120000_add_overrides_to_connections_and_oauth_sessions.cjs');

interface AlterCall {
    table: string;
    added: string[];
    dropped: string[];
}

function mockKnex() {
    const raw = vi.fn((_sql?: string) => Promise.resolve({ rows: [] }));
    const alterCalls: AlterCall[] = [];
    const schema = {
        alterTable: vi.fn((table: string, cb: (t: any) => void) => {
            const rec: AlterCall = { table, added: [], dropped: [] };
            const chain = { nullable: () => chain, notNullable: () => chain, defaultTo: () => chain };
            const builder = {
                jsonb: (name: string) => {
                    rec.added.push(name);
                    return chain;
                },
                dropColumn: (name: string) => {
                    rec.dropped.push(name);
                }
            };
            cb(builder);
            alterCalls.push(rec);
            return Promise.resolve();
        })
    };
    return { knex: { schema, raw }, raw, alterCalls };
}

describe('migration: add overrides to connections and oauth sessions', () => {
    it('adds a nullable overrides jsonb column to both tables and backfills from connection_config', async () => {
        const { knex, raw, alterCalls } = mockKnex();

        await migration.up(knex);

        const added = alterCalls.filter((c) => c.added.includes('overrides')).map((c) => c.table);
        expect(added).toContain('_nango_connections');
        expect(added).toContain('_nango_oauth_sessions');

        const backfill = raw.mock.calls.map((c) => c[0] as string).find((sql) => sql.includes('UPDATE _nango_connections'));
        expect(backfill).toBeDefined();
        // Sets overrides.webhook_url from connection_config and strips the key from connection_config.
        expect(backfill).toContain("jsonb_build_object('webhook_url', connection_config->>'webhook_url')");
        expect(backfill).toContain("connection_config - 'webhook_url'");
        expect(backfill).toContain("WHERE jsonb_exists(connection_config, 'webhook_url')");
    });

    it('drops the overrides column from both tables on rollback', async () => {
        const { knex, alterCalls } = mockKnex();

        await migration.down(knex);

        const dropped = alterCalls.filter((c) => c.dropped.includes('overrides')).map((c) => c.table);
        expect(dropped).toContain('_nango_connections');
        expect(dropped).toContain('_nango_oauth_sessions');
    });
});
