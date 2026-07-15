import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('./20260715120000_add_webhook_url_override.cjs');

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
                text: (name: string) => {
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

describe('migration: add webhook_url_override column', () => {
    it('adds a nullable webhook_url_override column to the three tables and backfills from connection_config', async () => {
        const { knex, raw, alterCalls } = mockKnex();

        await migration.up(knex);

        const added = alterCalls.filter((c) => c.added.includes('webhook_url_override')).map((c) => c.table);
        expect(added).toContain('_nango_connections');
        expect(added).toContain('_nango_oauth_sessions');
        expect(added).toContain('connect_sessions');

        const backfill = raw.mock.calls.map((c) => c[0] as string).find((sql) => sql.includes('UPDATE _nango_connections'));
        expect(backfill).toBeDefined();
        // Moves connection_config.webhook_url into the column and strips the key from connection_config.
        expect(backfill).toContain("webhook_url_override = NULLIF(TRIM(connection_config->>'webhook_url'), '')");
        expect(backfill).toContain("connection_config - 'webhook_url'");
        expect(backfill).toContain("WHERE jsonb_exists(connection_config, 'webhook_url')");
    });

    it('is a no-op on rollback (rollbacks are not supported)', async () => {
        const { knex, raw, alterCalls } = mockKnex();

        await migration.down(knex);

        expect(alterCalls).toHaveLength(0);
        expect(raw).not.toHaveBeenCalled();
    });
});
